import { pinKind, targetPackage } from './lib/targetPins.js';
import { supportedPeripheral } from './lib/boardProfile.js';

export default function PackagePinout({ profile, connections, selectedIndex, onSelectIndex, onAssign }) {
  const target = targetPackage(profile?.mcu?.part);
  if (!target) return <div className="validation warn">Bu STM32 paketi için doğrulanmış pinout henüz yok. Pin ataması kapalı.</div>;
  const sideSize = target.pins.length / 4;
  const selected = connections[selectedIndex];
  const occupied = new Map();
  for (const connection of profile.connections) {
    if (!connection.mcuPin) continue;
    const shared = occupied.get(connection.mcuPin) || [];
    shared.push(connection);
    occupied.set(connection.mcuPin, shared);
  }
  const canShare = (pin) => (occupied.get(pin) || []).every((connection) =>
    connection === selected || (['SCL', 'SDA', 'SCK', 'MISO', 'MOSI'].includes(selected?.role)
      && connection.role === selected.role && connection.peripheral === selected.peripheral));
  const makePin = ({ number, name }) => {
    const kind = pinKind(name);
    const assigned = connections.filter((item) => item.mcuPin === name);
    const available = Boolean(selected && supportedPeripheral(profile.mcu.part, selected.peripheral, selected.role, name).supported === true && canShare(name));
    const status = assigned.length ? 'assigned' : !available && occupied.has(name) ? 'occupied'
      : available ? 'available' : kind;
    return <button key={number} type="button" className={`package-pin ${status}`}
      disabled={!available} title={`${number}: ${name}${assigned.length ? ` · ${assigned.map((item) => item.role).join(', ')}` : ''}`}
      aria-label={`${number}. bacak ${name}${available ? `, ${selected.role} için seç` : ', seçilemez'}`}
      onClick={() => onAssign(name)}>
      <small>{number}</small><strong>{name}</strong>
    </button>;
  };
  const side = (name, pins) => <div className={`package-side ${name}`}>{pins.map(makePin)}</div>;
  const pins = target.pins;
  return <div className="pinout-workspace">
    <div className="pinout-roles" aria-label="Sensör bağlantıları">
      {connections.map((connection, index) => <button key={`${connection.role}-${index}`} type="button"
        className={index === selectedIndex ? 'selected' : ''} onClick={() => onSelectIndex(index)}>
        <span><strong>{connection.role}</strong><small>{connection.sensorPin || 'Sensör pini'}</small></span>
        <span className="pinout-role-value">{connection.mcuPin || 'Pin seç'}<small>{connection.mcuPin ? `#${pins.find((item) => item.name === connection.mcuPin)?.number || '?'}` : ''}</small></span>
      </button>)}
      <p>Önce soldan bir hat seç, sonra STM32 üzerindeki uygun bacağa tıkla. Dolu ve ayrılmış bacaklar seçilemez.</p>
    </div>
    <div className="package-board" style={{ '--pin-count': sideSize }} aria-label={`${profile.mcu.part} ${target.package} üstten görünüm`}>
      {side('top', pins.slice(sideSize * 3).reverse())}
      {side('left', pins.slice(0, sideSize).reverse())}
      <div className="package-core"><span className="package-pin-one">● PIN 1</span><strong>{profile.mcu.part}</strong><small>{target.package} · ÜSTTEN GÖRÜNÜM</small><span>{selected ? `${selected.role} → ${selected.mcuPin || 'pin seç'}` : 'Bir bağlantı seç'}</span></div>
      {side('right', pins.slice(sideSize * 2, sideSize * 3).reverse())}
      {side('bottom', pins.slice(sideSize, sideSize * 2))}
    </div>
  </div>;
}
