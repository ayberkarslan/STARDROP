// Trace only explicit LED parts (or a diode explicitly named LED on its net).
// Transistors, other diodes, connectors and supply rails are never GPIO bridges.
export function netlistLeds(parser, mcuRef) {
  const rail = name => /^(?:GND|[AD]GND|VSS\w*)$/i.test(name) ? 'ground'
    : /^(?:\+?(?:3V3|5V|3\.3V|1\.8V)\w*|VDD\w*|VCC\w*|VBAT)$/i.test(name) ? 'power' : null;
  const trace = (start, ledRef) => {
    const queue = [{ net: start.netName, path: [start.netName], resistor: false, bridge: false }], visited = new Set(), found = [];
    while (queue.length) {
      const item = queue.shift();
      if (visited.has(item.net) || item.path.length > 12) continue;
      visited.add(item.net);
      const supply = rail(item.net);
      if (supply) { found.push({ ...item, rail: supply }); continue; }
      for (const node of parser.nets[item.net] || []) {
        if (node.refDesignator === mcuRef) {
          const gpio = node.pinName.match(/^(P[A-K]\d{1,2})(?:$|\/)/i);
          if (gpio) found.push({ ...item, gpio: gpio[1].toUpperCase() });
          else if (rail(node.pinName)) found.push({ ...item, rail: rail(node.pinName) });
        }
        if (node.refDesignator === ledRef) continue;
        const component = parser.components[node.refDesignator];
        if (!['RESISTOR', 'SOLDER_BRIDGE'].includes(component?.category)) continue;
        const pins = parser.componentToPins[node.refDesignator] || [];
        if (new Set(pins.map(pin => pin.pinNumber)).size !== 2) continue;
        for (const pin of pins) if (pin.netName !== item.net) queue.push({ net: pin.netName,
          path: [...item.path, node.refDesignator, pin.netName],
          resistor: item.resistor || component.category === 'RESISTOR', bridge: item.bridge || component.category === 'SOLDER_BRIDGE' });
      }
    }
    return found;
  };
  const components = [], connections = [];
  for (const [ref, part] of Object.entries(parser.components)) {
    const pins = parser.componentToPins[ref] || [];
    const text = `${part.partValue} ${part.description}`;
    const namedLed = pins.some(pin => /(?:^|[^A-Z])(?:USER[_ -]?)?LED(?:[^A-Z]|$)/i.test(pin.netName));
    if (!(part.category === 'LED' || /^(?:D|LD)\d/.test(ref) && (/LED|LIGHT EMITTING/i.test(text) || namedLed))) continue;
    const endpoints = pins.map(pin => ({ pin, paths: trace(pin, ref) }));
    const gpioPaths = endpoints.flatMap(endpoint => endpoint.paths.filter(path => path.gpio).map(path => ({ ...path, pin: endpoint.pin })));
    const unique = [...new Set(gpioPaths.map(path => path.gpio))];
    // A rail tied to the GPIO side, multiple GPIOs, or an LED with >2 pins
    // needs manual inspection; do not pretend an RGB/transistor circuit is a single GPIO.
    const candidate = gpioPaths[0];
    const rails = new Set(endpoints.flatMap(endpoint => endpoint.paths.filter(path => path.rail).map(path => path.rail)));
    const powerOnly = unique.length === 0 && rails.has('power') && rails.has('ground');
    const gpioSide = candidate && endpoints.find(endpoint => endpoint.pin.pinNumber === candidate.pin.pinNumber);
    const safe = new Set(pins.map(pin => pin.pinNumber)).size === 2 && unique.length === 1
      && !gpioSide.paths.some(path => path.rail);
    const other = safe && endpoints.filter(endpoint => endpoint.pin.pinNumber !== candidate.pin.pinNumber);
    const oppositeRails = safe ? [...new Set(other.flatMap(endpoint => endpoint.paths.filter(path => path.rail).map(path => path.rail)))] : [];
    const cathode = [candidate?.pin.pinName, candidate?.pin.pinNumber].some(name => /^(?:K|C|CATHODE)$/i.test(name || ''));
    const anode = [candidate?.pin.pinName, candidate?.pin.pinNumber].some(name => /^(?:A|ANODE)$/i.test(name || ''));
    const polarity = safe && oppositeRails.length === 1 && (cathode && oppositeRails[0] === 'power' || anode && oppositeRails[0] === 'ground');
    const labels = [...(candidate?.path || []), ...pins.map(pin => pin.netName)];
    const label = labels.find(name => /USER[_ -]?LED/i.test(name)) || labels.find(name => /LED/i.test(name));
    const note = powerOnly ? 'Güç LED’i; MCU’ya bağlı değil, yazılımla kontrol edilemez.'
      : !safe ? 'GPIO tekil olarak bulunamadı; bağlantıyı elle kontrol et.'
      : !polarity ? 'GPIO bulundu; LED yönünü şemadan doğrula.' : null;
    components.push({ ref, part: 'LED', originalPart: part.partValue, displayName: label || part.description || 'LED',
      category: 'OUTPUT', protocol: 'GPIO', peripheral: 'GPIO', blinkMs: 500, onMs: 500, offMs: 500,
      ...(polarity ? { activeLow: cathode } : {}), detectionNote: note,
      polaritySource: polarity ? 'NET' : 'UNKNOWN', powerOnly });
    connections.push({ componentRef: ref, componentPart: 'LED', role: 'LED', sensorPin: candidate?.pin.pinName || 'LED',
      mcuPin: safe ? candidate.gpio : null, peripheral: 'GPIO', approved: false, source: 'NET',
      path: safe ? candidate.path : [], confidence: safe ? 60 : 0,
      evidence: { directTrace: safe && candidate.path.length === 1, knownPartPin: polarity,
        seriesResistor: safe && (candidate.resistor || other.some(endpoint => endpoint.paths.some(path => path.resistor))),
        solderBridge: safe && candidate.bridge } });
  }
  return { components, connections };
}
