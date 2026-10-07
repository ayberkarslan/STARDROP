use gimli::{AttributeValue, Dwarf, EndianSlice, LittleEndian, Reader, Section, Unit, UnitOffset};
use object::{Object, ObjectSection, ObjectSymbol};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

type R<'a> = EndianSlice<'a, LittleEndian>;
#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WatchVariable { pub name: String, pub address: u32, pub size: u32, pub kind: String, pub type_name: String }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchElf { pub variables: Vec<WatchVariable>, pub image_sha256: String, pub image_size: usize, pub elf_sha256: String }

fn scalar<'a>(dwarf: &Dwarf<R<'a>>, unit: &Unit<R<'a>>, mut offset: UnitOffset, depth: usize) -> Result<(String, u32, String), String> {
    for _ in depth..24 {
        let entry = unit.entry(offset).map_err(|e| e.to_string())?;
        if entry.tag() == gimli::DW_TAG_base_type {
            let size = entry.attr_value(gimli::DW_AT_byte_size).map_err(|e| e.to_string())?.and_then(|v| v.udata_value()).unwrap_or(0) as u32;
            let encoding = entry.attr_value(gimli::DW_AT_encoding).map_err(|e| e.to_string())?;
            let kind = match encoding {
                Some(AttributeValue::Encoding(gimli::DW_ATE_float)) if matches!(size, 4 | 8) => "float",
                Some(AttributeValue::Encoding(gimli::DW_ATE_signed | gimli::DW_ATE_signed_char)) if matches!(size, 1 | 2 | 4 | 8) => "signed",
                Some(AttributeValue::Encoding(gimli::DW_ATE_unsigned | gimli::DW_ATE_unsigned_char)) if matches!(size, 1 | 2 | 4 | 8) => "unsigned",
                Some(AttributeValue::Encoding(gimli::DW_ATE_boolean)) if size == 1 => "bool",
                _ => return Err("Yalnız sayısal skaler değişkenler destekleniyor".into()),
            };
            let name = entry.attr_value(gimli::DW_AT_name).map_err(|e| e.to_string())?
                .and_then(|v| dwarf.attr_string(unit, v).ok()).map(|v| v.to_string_lossy().into_owned()).unwrap_or_default();
            return Ok((kind.into(), size, name));
        }
        if !matches!(entry.tag(), gimli::DW_TAG_typedef | gimli::DW_TAG_volatile_type | gimli::DW_TAG_const_type | gimli::DW_TAG_restrict_type | gimli::DW_TAG_atomic_type) { break; }
        match entry.attr_value(gimli::DW_AT_type).map_err(|e| e.to_string())? { Some(AttributeValue::UnitRef(next)) => offset = next, _ => break }
    }
    Err("Tür çözümlenemedi; pointer, struct ve array bu sürümde izlenmez".into())
}

fn flash_image(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let word = |offset: usize| bytes.get(offset..offset + 4).map(|s| u32::from_le_bytes(s.try_into().unwrap())).ok_or("ELF tablosu eksik");
    let half = |offset: usize| bytes.get(offset..offset + 2).map(|s| u16::from_le_bytes(s.try_into().unwrap()) as usize).ok_or("ELF tablosu eksik");
    let table = word(28)? as usize; let stride = half(42)?; let count = half(44)?;
    if stride < 32 || count == 0 || count > 1024 || table.checked_add(stride * count).is_none_or(|end| end > bytes.len()) { return Err("ELF program tablosu bozuk".into()); }
    let mut segments = Vec::new(); let mut end = 0x08000000u32;
    for index in 0..count {
        let off = table + stride * index; let address = word(off + 12)?; let size = word(off + 16)?;
        if word(off)? != 1 || size == 0 || !(0x08000000..0x08100000).contains(&address) { continue; }
        let file = word(off + 4)? as usize;
        if address.checked_add(size).is_none_or(|v| v > 0x08100000) || file.checked_add(size as usize).is_none_or(|v| v > bytes.len()) { return Err("ELF segment sınırı geçersiz".into()); }
        end = end.max(address + size); segments.push((address, file, size as usize));
    }
    if !segments.iter().any(|s| s.0 == 0x08000000) { return Err("ELF flash başlangıcı 0x08000000 olmalı".into()); }
    let mut image = vec![0xff; (end - 0x08000000) as usize];
    let mut occupied = vec![false; image.len()];
    for (address, file, size) in segments {
        let start = (address - 0x08000000) as usize;
        if occupied[start..start+size].iter().any(|used| *used) { return Err("ELF flash segmentleri çakışıyor".into()); }
        image[start..start+size].copy_from_slice(&bytes[file..file+size]); occupied[start..start+size].fill(true);
    }
    Ok(image)
}

pub fn inspect(bytes: &[u8]) -> Result<WatchElf, String> {
    if bytes.len() < 52 || bytes.len() > 16 * 1024 * 1024 || bytes[..6] != [0x7f, b'E', b'L', b'F', 1, 1] { return Err("32-bit little-endian ARM ELF seç (en fazla 16 MB)".into()); }
    let object = object::File::parse(bytes).map_err(|e| e.to_string())?;
    if object.architecture() != object::Architecture::Arm || object.kind() != object::ObjectKind::Executable { return Err("Bağlanmış ARM firmware ELF’i gerekli; .o dosyası kullanılamaz".into()); }
    let image = flash_image(bytes)?;
    let dwarf = Dwarf::load(|id| -> Result<R<'_>, gimli::Error> {
        let data = object.section_by_name(id.name()).and_then(|s| s.data().ok()).unwrap_or(&[]);
        Ok(EndianSlice::new(data, LittleEndian))
    }).map_err(|e| e.to_string())?;
    if dwarf.debug_info.reader().is_empty() { return Err("ELF’te debug bilgisi yok. -g ile yeniden derle; strip edilmemiş ELF seç".into()); }
    let symbols: BTreeMap<_, _> = object.symbols().filter(|s| s.kind() == object::SymbolKind::Data && s.address() >= 0x20000000 && s.address() < 0x20020000)
        .filter_map(|s| s.name().ok().map(|n| ((n.to_owned(), s.address()), s.size()))).collect();
    let mut variables = BTreeMap::new(); let mut headers = dwarf.units(); let mut count = 0;
    while let Some(header) = headers.next().map_err(|e| e.to_string())? {
        let unit = dwarf.unit(header).map_err(|e| e.to_string())?;
        let mut entries = unit.entries();
        while let Some((_, entry)) = entries.next_dfs().map_err(|e| e.to_string())? {
            count += 1; if count > 500000 { return Err("ELF debug tablosu fazla büyük".into()); }
            if entry.tag() != gimli::DW_TAG_variable { continue; }
            let Some(AttributeValue::Exprloc(location)) = entry.attr_value(gimli::DW_AT_location).map_err(|e| e.to_string())? else { continue; };
            let mut ops = location.operations(unit.encoding());
            let Some(gimli::Operation::Address { address }) = ops.next().map_err(|e| e.to_string())? else { continue; };
            if ops.next().map_err(|e| e.to_string())?.is_some() { continue; }
            let declaration = match entry.attr_value(gimli::DW_AT_specification).map_err(|e| e.to_string())? {
                Some(AttributeValue::UnitRef(offset)) => Some(unit.entry(offset).map_err(|e| e.to_string())?), _ => None,
            };
            let name_attr = entry.attr_value(gimli::DW_AT_linkage_name).map_err(|e| e.to_string())?
                .or(entry.attr_value(gimli::DW_AT_name).map_err(|e| e.to_string())?)
                .or(declaration.as_ref().and_then(|d| d.attr_value(gimli::DW_AT_name).ok().flatten()));
            let Some(name_attr) = name_attr else { continue; };
            let name = dwarf.attr_string(&unit, name_attr).map_err(|e| e.to_string())?.to_string_lossy().into_owned();
            if name.len() > 200 { continue; }
            let type_attr = entry.attr_value(gimli::DW_AT_type).map_err(|e| e.to_string())?
                .or(declaration.as_ref().and_then(|d| d.attr_value(gimli::DW_AT_type).ok().flatten()));
            let Some(AttributeValue::UnitRef(offset)) = type_attr else { continue; };
            let Ok((kind, size, type_name)) = scalar(&dwarf, &unit, offset, 0) else { continue; };
            if address < 0x20000000 || address.checked_add(size as u64).is_none_or(|end| end > 0x20020000)
                || !symbols.get(&(name.clone(), address)).is_some_and(|symbol_size| *symbol_size == size as u64) { continue; }
            variables.insert((name.clone(), address), WatchVariable { name, address: address as u32, size, kind, type_name });
        }
    }
    if variables.is_empty() { return Err("RAM’de sabit adresli sayısal global/statik değişken bulunamadı; -g ve kullanılan değişkenler gerekli".into()); }
    if variables.len() > 5000 { return Err("ELF’te fazla değişken var".into()); }
    Ok(WatchElf { variables: variables.into_values().collect(), image_sha256: format!("{:x}", Sha256::digest(&image)), image_size: image.len(), elf_sha256: format!("{:x}", Sha256::digest(bytes)) })
}
#[tauri::command]
pub async fn inspect_watch_elf(bytes: Vec<u8>) -> Result<WatchElf, String> {
    tauri::async_runtime::spawn_blocking(move || inspect(&bytes)).await.map_err(|e| e.to_string())?
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn malformed_files_are_rejected() { assert!(inspect(&[]).is_err()); assert!(inspect(&vec![0; 52]).is_err()); }
    #[test] fn ram_demo_when_configured() {
        let Ok(path) = std::env::var("STARDROP_TEST_WATCH_ELF") else { return; };
        let bytes = std::fs::read(&path).unwrap();
        let info = inspect(&bytes).unwrap();
        let bin = std::fs::read(std::path::Path::new(&path).with_extension("bin")).unwrap();
        assert_eq!(flash_image(&bytes).unwrap(), bin);
        for (name, kind) in [("watch_random", "unsigned"), ("watch_temperature", "float"), ("watch_signed", "signed")] {
            let variable = info.variables.iter().find(|v| v.name == name).unwrap(); assert_eq!(variable.kind, kind); assert_eq!(variable.size, 4);
        }
        assert_eq!(info.image_sha256.len(), 64); assert!(info.image_size > 512);
    }
}
