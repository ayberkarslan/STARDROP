#pragma once

#include <Arduino.h>

const char INDEX_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>STARDROP • Yıldız Roket Takımı</title>
    <style>
        :root {
            --navy-deep: #000000;
            --navy-surface: rgba(6, 10, 22, 0.88);
            --navy-card: rgba(8, 14, 30, 0.7);
            --gold-primary: #c5a059;
            --gold-light: #e8d39c;
            --gold-glow: rgba(197, 160, 89, 0.18);
            --gold-border: rgba(197, 160, 89, 0.18);
            --gold-border-focus: rgba(197, 160, 89, 0.45);
            --text-primary: #f0f3f8;
            --text-secondary: #707e94;
            --text-gold: #d4af37;
            --success: #30d158;
            --error: #ff453a;
            --warn: #ffd60a;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", sans-serif;
            background-color: var(--navy-deep);
            background-image: 
                radial-gradient(circle at 50% 5%, rgba(12, 22, 50, 0.5) 0%, transparent 65%),
                radial-gradient(circle at 50% 95%, rgba(197, 160, 89, 0.03) 0%, transparent 50%);
            color: var(--text-primary);
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 20px;
            -webkit-font-smoothing: antialiased;
        }

        .card {
            background: var(--navy-surface);
            backdrop-filter: blur(35px);
            -webkit-backdrop-filter: blur(35px);
            border: 1px solid var(--gold-border);
            border-radius: 22px;
            width: 100%;
            max-width: 480px;
            padding: 28px;
            box-shadow: 0 30px 70px rgba(0, 0, 0, 0.9), 0 0 1px rgba(255, 255, 255, 0.05);
            position: relative;
            overflow: hidden;
        }

        .card::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0;
            height: 1.5px;
            background: linear-gradient(90deg, transparent, var(--gold-primary), transparent);
            opacity: 0.6;
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 22px;
        }

        .title-group h1 {
            font-size: 22px;
            font-weight: 800;
            letter-spacing: 0.04em;
            background: linear-gradient(135deg, #ffffff 40%, var(--gold-light) 75%, var(--gold-primary) 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .title-group p {
            font-size: 11px;
            color: var(--text-secondary);
            margin-top: 3px;
            letter-spacing: 0.05em;
            font-weight: 500;
            text-transform: uppercase;
        }

        .header-actions {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .btn-gear {
            background: rgba(197, 160, 89, 0.08);
            border: 1px solid var(--gold-border);
            color: var(--text-gold);
            border-radius: 50%;
            width: 28px;
            height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s;
        }

        .btn-gear:hover {
            background: rgba(197, 160, 89, 0.2);
            transform: rotate(30deg);
        }

        /* DİNAMİK BAĞLANTI DURUMU ROZETİ */
        .status-pill {
            display: inline-flex;
            align-items: center;
            gap: 7px;
            padding: 4px 11px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 0.02em;
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .status-pill.online {
            background: rgba(197, 160, 89, 0.08);
            border: 1px solid var(--gold-border);
            color: var(--text-gold);
        }
        .status-pill.online .pulse-dot {
            background-color: var(--gold-primary);
            box-shadow: 0 0 8px var(--gold-primary);
            animation: pulse 2s infinite;
        }

        .status-pill.offline {
            background: rgba(255, 69, 58, 0.1);
            border: 1px solid rgba(255, 69, 58, 0.3);
            color: var(--error);
        }
        .status-pill.offline .pulse-dot {
            background-color: var(--error);
            box-shadow: 0 0 8px var(--error);
            animation: none;
        }

        .status-pill.connecting {
            background: rgba(255, 214, 10, 0.08);
            border: 1px solid rgba(255, 214, 10, 0.25);
            color: var(--warn);
        }
        .status-pill.connecting .pulse-dot {
            background-color: var(--warn);
            box-shadow: 0 0 6px var(--warn);
            animation: blink 1s infinite;
        }

        .pulse-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            transition: background-color 0.3s;
        }

        @keyframes pulse {
            0% { transform: scale(0.9); opacity: 0.7; }
            50% { transform: scale(1.35); opacity: 1; box-shadow: 0 0 10px var(--gold-primary); }
            100% { transform: scale(0.9); opacity: 0.7; }
        }

        @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
        }

        .drop-zone {
            border: 1.5px dashed rgba(197, 160, 89, 0.2);
            border-radius: 16px;
            padding: 30px 20px;
            text-align: center;
            cursor: pointer;
            transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            background: rgba(4, 7, 18, 0.55);
            margin-bottom: 16px;
        }

        .drop-zone:hover, .drop-zone.dragover {
            border-color: var(--gold-primary);
            background: rgba(197, 160, 89, 0.04);
            box-shadow: 0 0 24px var(--gold-glow);
        }

        .drop-zone svg {
            width: 32px;
            height: 32px;
            fill: none;
            stroke: var(--gold-primary);
            stroke-width: 1.5;
            margin-bottom: 10px;
            opacity: 0.85;
            transition: opacity 0.2s;
        }

        .drop-zone:hover svg {
            opacity: 1;
            filter: drop-shadow(0 0 6px rgba(197, 160, 89, 0.4));
        }

        .drop-zone p {
            font-size: 13px;
            color: var(--text-secondary);
        }

        .drop-zone b {
            color: var(--gold-light);
            font-weight: 500;
        }

        .file-card {
            display: none;
            background: rgba(5, 9, 20, 0.7);
            border: 1px solid var(--gold-border);
            border-radius: 12px;
            padding: 12px 16px;
            margin-bottom: 16px;
            font-size: 12px;
        }

        .file-card .row {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .file-name {
            font-weight: 600;
            color: #ffffff;
            letter-spacing: -0.01em;
            word-break: break-all;
        }

        .file-badge {
            font-size: 10px;
            background: rgba(197, 160, 89, 0.12);
            color: var(--text-gold);
            padding: 2px 8px;
            border-radius: 6px;
            font-weight: 700;
            border: 1px solid var(--gold-border);
        }

        .file-size {
            color: var(--text-secondary);
            font-size: 11px;
            margin-top: 4px;
        }

        button.btn-flash {
            width: 100%;
            background: linear-gradient(135deg, #e8d39c 0%, var(--gold-primary) 50%, #9a762e 100%);
            color: #02040a;
            border: none;
            padding: 13.5px;
            border-radius: 12px;
            font-size: 13.5px;
            font-weight: 700;
            letter-spacing: 0.01em;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
        }

        button.btn-flash:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow: 0 8px 24px rgba(197, 160, 89, 0.35);
            filter: brightness(1.04);
        }

        button.btn-flash:disabled {
            background: rgba(197, 160, 89, 0.08);
            color: rgba(255, 255, 255, 0.2);
            cursor: not-allowed;
            box-shadow: none;
            transform: none;
        }

        .progress-wrapper {
            margin-top: 20px;
        }

        .progress-labels {
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            color: var(--text-secondary);
            margin-bottom: 8px;
            font-weight: 500;
        }

        .progress-bar-bg {
            background: rgba(4, 7, 16, 0.8);
            border: 1px solid rgba(197, 160, 89, 0.12);
            border-radius: 10px;
            height: 5px;
            overflow: hidden;
        }

        .progress-bar-fill {
            background: linear-gradient(90deg, var(--gold-primary), #fff3b0);
            height: 100%;
            width: 0%;
            border-radius: 10px;
            transition: width 0.15s ease-out;
            box-shadow: 0 0 10px var(--gold-primary);
        }

        .terminal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 20px;
            margin-bottom: 8px;
            font-size: 10px;
            font-weight: 700;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.08em;
        }

        .terminal {
            background: #020307;
            border: 1px solid rgba(197, 160, 89, 0.12);
            border-radius: 12px;
            padding: 12px 14px;
            height: 155px;
            overflow-y: auto;
            font-family: "SF Mono", SFMono-Regular, ui-monospace, Menlo, Monaco, Consolas, monospace;
            font-size: 10.5px;
            line-height: 1.6;
            color: #637085;
            scrollbar-width: thin;
            scrollbar-color: var(--gold-border) transparent;
        }

        .terminal::-webkit-scrollbar { width: 4px; }
        .terminal::-webkit-scrollbar-thumb { background: var(--gold-border); border-radius: 4px; }

        .terminal p { margin: 0; }
        .log-info { color: #6e7c91; }
        .log-chunk { color: var(--text-gold); }
        .log-success { color: var(--gold-light); font-weight: 600; }
        .log-error { color: var(--error); font-weight: 600; }

        /* MODAL (AĞ YÖNETİCİSİ) */
        .modal-overlay {
            display: none;
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(10px);
            z-index: 100;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }

        .modal {
            background: #060a16;
            border: 1px solid var(--gold-border);
            border-radius: 18px;
            width: 100%;
            max-width: 440px;
            padding: 24px;
            box-shadow: 0 20px 50px rgba(0,0,0,0.9);
        }

        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }

        .modal-header h2 {
            font-size: 16px;
            color: var(--gold-light);
        }

        .btn-close {
            background: none;
            border: none;
            color: var(--text-secondary);
            font-size: 20px;
            cursor: pointer;
        }

        .net-section { margin-bottom: 16px; }
        .net-section label { display: block; font-size: 11px; color: var(--text-secondary); text-transform: uppercase; font-weight: 600; margin-bottom: 6px; }
        
        .net-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: rgba(14, 26, 60, 0.5);
            border: 1px solid var(--gold-border);
            border-radius: 8px;
            padding: 8px 12px;
            margin-bottom: 6px;
            font-size: 12px;
        }

        .btn-del {
            background: none;
            border: none;
            color: var(--error);
            cursor: pointer;
            font-size: 12px;
            font-weight: 600;
            padding: 2px 6px;
        }

        .net-input {
            width: 100%;
            background: #020307;
            border: 1px solid var(--gold-border);
            border-radius: 8px;
            padding: 10px 12px;
            color: #fff;
            font-size: 12px;
            margin-bottom: 8px;
        }

        .btn-save-net {
            width: 100%;
            background: var(--gold-primary);
            color: #000;
            border: none;
            padding: 10px;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 700;
            cursor: pointer;
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="header">
            <div class="title-group">
                <h1>STARDROP</h1>
                <p>Yıldız Roket Takımı • Aviyonik OTA</p>
            </div>
            <div class="header-actions">
                <div class="status-pill connecting" id="statusPill">
                    <span class="pulse-dot" id="statusDot"></span>
                    <span id="statusText">Bağlanıyor...</span>
                </div>
                <button class="btn-gear" onclick="openNetworkModal()" title="Ağ Yönetimi">⚙️</button>
            </div>
        </div>

        <div class="drop-zone" id="dropZone" onclick="document.getElementById('fileInput').click()">
            <svg viewBox="0 0 24 24">
                <path d="M12 2L15 8L22 9L17 14L18.5 21L12 17.5L5.5 21L7 14L2 9L9 8L12 2Z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <p><b>.bin</b> veya <b>.elf</b> yazılımını sürükleyin</p>
            <input type="file" id="fileInput" accept=".bin,.elf" style="display: none;">
        </div>

        <div class="file-card" id="fileCard">
            <div class="row">
                <span class="file-name" id="fileName"></span>
                <span class="file-badge" id="fileBadge">BIN</span>
            </div>
            <div class="file-size" id="fileSize"></div>
        </div>

        <button class="btn-flash" id="flashBtn" disabled onclick="startFlashingProcess()">Yüklemeyi Başlat</button>

        <div class="progress-wrapper">
            <div class="progress-labels">
                <span id="statusLabel">Beklemede</span>
                <span id="pctLabel">%0</span>
            </div>
            <div class="progress-bar-bg">
                <div class="progress-bar-fill" id="progBar"></div>
            </div>
        </div>

        <div class="terminal-header">
            <span>Aviyonik Telemetri & Doğrulama</span>
            <span id="chunkCount" style="color: var(--text-gold)"></span>
        </div>
        <div class="terminal" id="terminal">
            <p class="log-info">[STARDROP] YRT Yer İstasyonu Hazır. Yazılım bekleniyor...</p>
        </div>
    </div>

    <!-- AĞ YÖNETİMİ MODAL -->
    <div class="modal-overlay" id="netModal">
        <div class="modal">
            <div class="modal-header">
                <h2>⚙️ Wi-Fi Ağ Yöneticisi</h2>
                <button class="btn-close" onclick="closeNetworkModal()">✕</button>
            </div>
            <div class="net-section">
                <label>Kayıtlı Ağlar (NVS Hafızası)</label>
                <div id="savedNetworksList">
                    <p style="font-size: 11px; color: var(--text-secondary);">Yükleniyor...</p>
                </div>
            </div>
            <div class="net-section">
                <label>Yeni Ağ Ekle</label>
                <input type="text" class="net-input" id="newSsid" placeholder="Wi-Fi Adı (SSID)">
                <input type="password" class="net-input" id="newPass" placeholder="Wi-Fi Şifresi">
                <button class="btn-save-net" onclick="saveNewNetwork()">Hafızaya Kaydet & Bağlan</button>
            </div>
        </div>
    </div>

    <script>
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('fileInput');
        const fileCard = document.getElementById('fileCard');
        const fileName = document.getElementById('fileName');
        const fileBadge = document.getElementById('fileBadge');
        const fileSize = document.getElementById('fileSize');
        const flashBtn = document.getElementById('flashBtn');
        const progBar = document.getElementById('progBar');
        const statusLabel = document.getElementById('statusLabel');
        const pctLabel = document.getElementById('pctLabel');
        const terminal = document.getElementById('terminal');
        const chunkCount = document.getElementById('chunkCount');
        const statusPill = document.getElementById('statusPill');
        const statusText = document.getElementById('statusText');
        const netModal = document.getElementById('netModal');
        const savedNetworksList = document.getElementById('savedNetworksList');

        let readyBinary = null;
        let isFlashing = false;
        let wasOnline = false;

        function log(msg, type = 'info') {
            const p = document.createElement('p');
            p.className = `log-${type}`;
            const time = new Date().toLocaleTimeString();
            p.innerText = `[${time}] ${msg}`;
            terminal.appendChild(p);
            terminal.scrollTop = terminal.scrollHeight;
        }

        async function checkConnection() {
            if (isFlashing) return;
            const start = performance.now();
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 1800);
                
                const res = await fetch('/ping', { signal: controller.signal, cache: 'no-store' });
                clearTimeout(timeoutId);

                if (res.ok) {
                    const latency = Math.round(performance.now() - start);
                    statusPill.className = 'status-pill online';
                    statusText.innerText = `Canlı • ${latency}ms`;
                    if (!wasOnline) {
                        log(`ESP32 ile bağlantı aktif (${latency}ms).`, 'success');
                        wasOnline = true;
                    }
                    if (readyBinary && !isFlashing) {
                        flashBtn.disabled = false;
                    }
                } else {
                    throw new Error();
                }
            } catch (err) {
                statusPill.className = 'status-pill offline';
                statusText.innerText = 'Bağlantı Koptu';
                flashBtn.disabled = true;
                if (wasOnline) {
                    log('ESP32 bağlantısı kesildi! Yeniden bağlanılıyor...', 'error');
                    wasOnline = false;
                }
            }
        }

        setInterval(checkConnection, 2000);
        checkConnection();

        // WI-FI MODAL İŞLEMLERİ
        function openNetworkModal() {
            netModal.style.display = 'flex';
            loadNetworkStatus();
        }

        function closeNetworkModal() {
            netModal.style.display = 'none';
        }

        async function loadNetworkStatus() {
            try {
                const res = await fetch('/api/wifi/status');
                const data = await res.json();
                savedNetworksList.innerHTML = '';
                
                if (data.saved && data.saved.length > 0) {
                    data.saved.forEach(s => {
                        const isCurrent = data.connected && data.ssid === s;
                        const div = document.createElement('div');
                        div.className = 'net-item';
                        div.innerHTML = `<span><b>${s}</b> ${isCurrent ? '<span style="color:var(--gold-primary); font-size:10px;">(Aktif)</span>' : ''}</span>
                                         <button class="btn-del" onclick="deleteNetwork('${s}')">Sil</button>`;
                        savedNetworksList.appendChild(div);
                    });
                } else {
                    savedNetworksList.innerHTML = '<p style="font-size: 11px; color: var(--text-secondary);">Kayıtlı ağ yok.</p>';
                }
            } catch (e) {
                savedNetworksList.innerHTML = '<p style="color:var(--error); font-size:11px;">Ağ listesi alınamadı!</p>';
            }
        }

        async function saveNewNetwork() {
            const ssid = document.getElementById('newSsid').value.trim();
            const pass = document.getElementById('newPass').value.trim();
            if (!ssid) { alert('Lütfen bir Wi-Fi adı girin!'); return; }

            try {
                await fetch('/api/wifi/add', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ssid: ssid, pass: pass })
                });
                document.getElementById('newSsid').value = '';
                document.getElementById('newPass').value = '';
                alert(`'${ssid}' ağı kaydedildi! ESP32 bağlanmayı deniyor.`);
                loadNetworkStatus();
            } catch (e) {
                alert('Ağ kaydedilemedi!');
            }
        }

        async function deleteNetwork(ssid) {
            if (!confirm(`'${ssid}' ağını silmek istediğinize emin misiniz?`)) return;
            try {
                await fetch('/api/wifi/remove', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ssid: ssid })
                });
                loadNetworkStatus();
            } catch (e) {
                alert('Silinemedi!');
            }
        }

        dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('dragover'); };
        dropZone.ondragleave = () => dropZone.classList.remove('dragover');
        dropZone.ondrop = (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length) processFile(e.dataTransfer.files[0]);
        };
        fileInput.onchange = (e) => {
            if (e.target.files.length) processFile(e.target.files[0]);
        };

        function parseElf(buffer) {
            const view = new DataView(buffer);
            if (view.getUint8(0) !== 0x7F || view.getUint8(1) !== 0x45 || view.getUint8(2) !== 0x4C || view.getUint8(3) !== 0x46) {
                throw new Error("Geçersiz ELF dosyası!");
            }
            const e_phoff = view.getUint32(28, true);
            const e_phentsize = view.getUint16(42, true);
            const e_phnum = view.getUint16(44, true);

            let flashSegments = [];
            let minAddr = 0xFFFFFFFF, maxAddr = 0;

            for (let i = 0; i < e_phnum; i++) {
                const ph = e_phoff + i * e_phentsize;
                const p_type = view.getUint32(ph + 0, true);
                const p_offset = view.getUint32(ph + 4, true);
                const p_paddr = view.getUint32(ph + 12, true);
                const p_filesz = view.getUint32(ph + 16, true);

                if (p_type === 1 && p_filesz > 0 && p_paddr >= 0x08000000 && p_paddr < 0x08200000) {
                    flashSegments.push({ offset: p_offset, paddr: p_paddr, filesz: p_filesz });
                    if (p_paddr < minAddr) minAddr = p_paddr;
                    if (p_paddr + p_filesz > maxAddr) maxAddr = p_paddr + p_filesz;
                }
            }

            if (flashSegments.length === 0) throw new Error("ELF içinde 0x08000000 Flash alanı bulunamadı!");

            const binArray = new Uint8Array(maxAddr - minAddr);
            binArray.fill(0xFF);
            const fileBytes = new Uint8Array(buffer);
            for (const seg of flashSegments) {
                binArray.set(fileBytes.subarray(seg.offset, seg.offset + seg.filesz), seg.paddr - minAddr);
            }
            return binArray.buffer;
        }

        function processFile(file) {
            const isElf = file.name.toLowerCase().endsWith('.elf');
            const isBin = file.name.toLowerCase().endsWith('.bin');

            if (!isElf && !isBin) {
                alert("Lütfen .bin veya .elf uzantılı dosya seçiniz!");
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    if (isElf) {
                        const rawBin = parseElf(e.target.result);
                        readyBinary = new Blob([rawBin], { type: 'application/octet-stream' });
                        fileBadge.innerText = 'ELF ➔ BIN';
                        fileSize.innerText = `${(file.size/1024).toFixed(1)} KB ELF ➔ ${(readyBinary.size/1024).toFixed(1)} KB Flash`;
                        log(`ELF ayrıştırıldı: ${readyBinary.size} bayt Flash verisi hazırlandı.`, 'chunk');
                    } else {
                        readyBinary = file;
                        fileBadge.innerText = 'RAW BIN';
                        fileSize.innerText = `${(file.size/1024).toFixed(1)} KB Flash Binary`;
                        log(`BIN hazır: ${readyBinary.size} bayt.`, 'info');
                    }

                    fileName.innerText = file.name;
                    fileCard.style.display = 'block';
                    if (wasOnline) flashBtn.disabled = false;
                } catch (err) {
                    alert("Ayrıştırma Hatası: " + err.message);
                    log(`Hata: ${err.message}`, 'error');
                    readyBinary = null;
                    flashBtn.disabled = true;
                }
            };
            reader.readAsArrayBuffer(file);
        }

        function startFlashingProcess() {
            if (!readyBinary) return;
            isFlashing = true;
            flashBtn.disabled = true;
            progBar.style.width = '0%';
            pctLabel.innerText = '%0';
            statusLabel.innerText = 'Yükleniyor...';
            log('Yazılım ESP32 belleğine aktarılıyor...', 'info');

            const formData = new FormData();
            formData.append('firmware', readyBinary, 'firmware.bin');

            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/upload', true);

            xhr.onload = () => {
                if (xhr.status === 200) {
                    log('Yazılım belleğe alındı. UART Flash akışı başlıyor...', 'info');
                    startSSEStream();
                } else {
                    log(`Yükleme hatası: ${xhr.responseText}`, 'error');
                    flashBtn.disabled = false;
                    isFlashing = false;
                }
            };

            xhr.onerror = () => {
                log('Yer istasyonu bağlantı hatası!', 'error');
                flashBtn.disabled = false;
                isFlashing = false;
            };

            xhr.send(formData);
        }

        function startSSEStream() {
            statusLabel.innerText = 'Flash Yazılıyor...';
            const evtSource = new EventSource('/stream-flash');

            evtSource.onmessage = (e) => {
                try {
                    const data = JSON.parse(e.data);
                    if (data.msg) log(data.msg, data.type || 'info');
                    if (data.pct !== undefined && data.pct >= 0) {
                        progBar.style.width = data.pct + '%';
                        pctLabel.innerText = '%' + data.pct;
                    }
                    if (data.chunks) {
                        chunkCount.innerText = data.chunks;
                    }
                    if (data.done) {
                        evtSource.close();
                        progBar.style.width = '100%';
                        pctLabel.innerText = '%100';
                        statusLabel.innerText = 'Tamamlandı';
                        statusLabel.style.color = 'var(--text-gold)';
                        flashBtn.disabled = false;
                        isFlashing = false;
                    }
                    if (data.error) {
                        evtSource.close();
                        statusLabel.innerText = 'Hata';
                        statusLabel.style.color = '#ff453a';
                        flashBtn.disabled = false;
                        isFlashing = false;
                    }
                } catch (err) {
                    console.error(err);
                }
            };

            evtSource.onerror = () => {
                evtSource.close();
                log('Akış oturumu kapandı.', 'info');
                flashBtn.disabled = false;
                isFlashing = false;
            };
        }
    </script>
</body>
</html>
)rawliteral";
