const POWER_GROUND_PATTERNS = [
    /^GND$/i, /^VSS.*/i, /^VSSA$/i, /^AGND$/i, /^DGND$/i,
    /^\+?3V3.*/i, /^\+?5V.*/i, /^VDD.*/i, /^VDDA$/i, /^VCC.*/i,
    /^1\.8V.*/i, /^VBAT$/i
];

const ROLE_PATTERNS = {
    SCK: [/^SCK$/i, /^SCL$/i, /^HSCX$/i, /^CLK$/i, /^SCLK$/i],
    SDI: [/^SDI$/i, /^SDA$/i, /^HSDX$/i, /^DIN$/i, /^MOSI$/i, /^DI\(IO0\)$/i, /^DI$/i],
    SDO: [/^SDO$/i, /^HSDO$/i, /^DOUT$/i, /^MISO$/i, /^DO\(IO1\)$/i, /^DO$/i],
    CS: [/^CS$/i, /^CSB$/i, /^HCSB$/i, /^NSS$/i, /^SS$/i, /^ENABLE$/i],
    INT: [/^INT$/i, /^HIRQ$/i, /^IRQ$/i, /^INT1$/i, /^INT2$/i, /^DRDY$/i],
    RESET: [/^RESETN$/i, /^RESET$/i, /^RST$/i, /^NRST$/i],
    TX: [/^TXD$/i, /^TX$/i, /^UART_TX$/i, /^USART_TX$/i],
    RX: [/^RXD$/i, /^RX$/i, /^UART_RX$/i, /^USART_RX$/i],
    CAN_H: [/^CANH$/i, /^CAN_H$/i],
    CAN_L: [/^CANL$/i, /^CAN_L$/i],
    WP: [/^WP/i, /^W\\P/i],
    HOLD: [/^HOLD/i, /^HD/i]
};

function isPowerOrGroundNet(netName) {
    const clean = netName.trim();
    for (const pat of POWER_GROUND_PATTERNS) {
        if (pat.test(clean)) return true;
    }
    return false;
}

function classifyComponent(des, partVal, desc) {
    const text = `${des} ${partVal} ${desc}`.toUpperCase();
    
    // Core ICs
    if (/\b(STM32|RP2040|ESP32|SAMD|NRF52|ATMEGA|PIC\d+)\b/.test(text)) return "MCU";
    if (/\b(W25Q|AT25|SST25|MX25|FLASH|EEPROM|SDCARD|EMMC)\b/.test(text)) return "MEMORY";
    if (/\b(MCP25|SN65|TJA|MAX30|CAN|RS485|RS232)\b/.test(text)) return "TRANSCEIVER";
    
    // Sensors
    if (/\b(BMP|MS5611|DPS310|LPS22|BME)\b/.test(text)) return "BAROMETER";
    if (/\b(BHI|MPU|ICM|LSM|BMI|ADXL|FXOS)\b/.test(text)) return "IMU";
    if (/\b(GPS|GNSS|NEO|UBLOX)\b/.test(text)) return "GPS";
    
    // Power & Analog
    if (des.startsWith("VR") || text.includes("AMS") || /\b(LDO|REGULATOR|TPS|LM\d+|MIC|TPS)\b/.test(text)) return "VOLTAGE_REGULATOR";
    if (/\b(OPAMP|LM358|MCP600)\b/.test(text)) return "OPAMP";
    
    // Passives & Discretes
    if (des.startsWith("R")) return "RESISTOR";
    if (des.startsWith("C")) return "CAPACITOR";
    if (des.startsWith("L") || des.startsWith("FB") || /\b(INDUCTOR|FERRITE)\b/.test(text)) return "INDUCTOR";
    if (des.startsWith("D") && text.includes("LED")) return "LED";
    if (des.startsWith("D")) return "DIODE";
    if (des.startsWith("Q") || des.startsWith("T") || /\b(MOSFET|TRANSISTOR)\b/.test(text)) return "TRANSISTOR";
    if (des.startsWith("Y") || des.startsWith("X") || text.includes("OSC") || text.includes("CRYSTAL")) return "OSCILLATOR";
    if (des.startsWith("SB") || text.includes("SOLDER")) return "SOLDER_BRIDGE";
    
    // Connectivity
    if (des.startsWith("CN") || des.startsWith("J") || des.startsWith("P") || text.includes("HEADER") || text.includes("CONN")) return "CONNECTOR";
    
    // Fallbacks
    if (des.startsWith("U") || des.startsWith("IC")) return "INTEGRATED_CIRCUIT";
    
    return "UNKNOWN";
}

function classifyRole(pinName) {
    const cleanName = pinName.replace(/[\(\)\\_]/g, "").toUpperCase();
    for (const [role, patterns] of Object.entries(ROLE_PATTERNS)) {
        for (const pat of patterns) {
            const cleanPat = new RegExp(pat.source.replace(/[\(\)\\_]/g, ""), "i");
            if (cleanPat.test(cleanName)) return role;
        }
    }
    return "GENERAL_IO";
}

export class DeterministicBoardParser {
    constructor(content, bomContent = null) {
        this.content = content;
        this.bomContent = bomContent; // Optional supplementary BOM data
        this.components = {};
        this.nets = {};
        this.componentToPins = {};
        this.warnings = [];
        this.errors = [];
    }

    parseAndResolve() {
        try {
            this.tokenize();
            this.indexPins();
            
            const mcuInfo = this.findMcu();
            if (!mcuInfo) {
                this.errors.push("No MCU (Microcontroller) detected in netlist.");
                return this.createResult(false, null, null, []);
            }
            
            const [mcuRef, mcuComp] = mcuInfo;
            const targetSensors = [];
            
            for (const [des, comp] of Object.entries(this.components)) {
                if (des === mcuRef) continue;
                if (["BAROMETER", "IMU", "FLASH_MEMORY", "TRANSCEIVER"].includes(comp.category)) {
                    targetSensors.push([des, comp]);
                } else if ((des.startsWith("IC") || des.startsWith("U") || des.startsWith("SEN")) && !["VOLTAGE_REGULATOR", "PASSIVE"].includes(comp.category)) {
                    const pins = this.componentToPins[des] || [];
                    if (pins.length <= 24 && pins.some(p => ["SDA", "SCL", "SDI", "SCK", "CS", "CSB", "INT", "HIRQ", "TXD", "RXD"].includes(p.pinName.toUpperCase()))) {
                        targetSensors.push([des, comp]);
                    }
                }
            }

            const detectedDevices = [];

            // Add deep BOM analysis
            const bomSummary = {};
            for (const [des, comp] of Object.entries(this.components)) {
                if (!bomSummary[comp.category]) {
                    bomSummary[comp.category] = { count: 0, items: [] };
                }
                bomSummary[comp.category].count++;
                bomSummary[comp.category].items.push(comp);
            }

            // Power Rail Extractor
            const powerNets = [];
            for (const netName of Object.keys(this.nets)) {
                if (isPowerOrGroundNet(netName)) {
                    powerNets.push({
                        name: netName,
                        connections: this.nets[netName].length
                    });
                }
            }
            powerNets.sort((a, b) => b.connections - a.connections);

            for (const [sensorDes, sensorComp] of targetSensors) {
                const pins = this.componentToPins[sensorDes] || [];
                const resolvedConnections = [];
                const notes = [];
                let protocol = "UNKNOWN";
                let csPinGroundedOrPulledHigh = false;

                for (const p of pins) {
                    const role = classifyRole(p.pinName);
                    if (["WP", "HOLD"].includes(role) && p.pinType === "POWER") continue;

                    const traceResults = this.tracePinToMcu(sensorDes, p.pinNumber, mcuRef);
                    if (!traceResults || traceResults.length === 0) continue;

                    for (const { mcuNode, path, mode } of traceResults) {
                        if (mode === "POWER_RAIL") {
                            notes.push(`Pin ${p.pinName} (Pin ${p.pinNumber}) connected to ${mcuNode.pinName}`);
                            const powerNetName = mcuNode.pinName.toUpperCase();
                            if (role === "CS" && (powerNetName.includes("3V3") || powerNetName.includes("1.8V") || powerNetName.includes("1V8") || powerNetName.includes("VDD") || powerNetName.includes("VCC"))) {
                                csPinGroundedOrPulledHigh = true;
                            }
                            continue;
                        }

                        const gpioMatch = mcuNode.pinName.match(/^P([A-Z])(\d+)/);
                        if (gpioMatch) {
                            const portLetter = gpioMatch[1];
                            const pinIdx = parseInt(gpioMatch[2], 10);
                            const portMacro = `GPIO${portLetter}`;

                            resolvedConnections.push({
                                sensor_name: sensorComp.partValue,
                                sensor_ref: sensorDes,
                                sensor_pin_num: p.pinNumber,
                                sensor_pin_name: p.pinName,
                                sensor_pin_role: role,
                                mcu_ref: mcuRef,
                                mcu_pin_num: mcuNode.pinNumber,
                                mcu_pin_name: mcuNode.pinName,
                                mcu_port: portMacro,
                                mcu_pin_index: pinIdx,
                                net_path: path,
                                connection_mode: mode,
                                confidence_level: mode === "DIRECT_TRACE" ? "HIGH" : "MEDIUM"
                            });
                        }
                    }
                }

                if (sensorComp.category === "TRANSCEIVER") {
                    protocol = sensorComp.partValue.toUpperCase().includes("CAN") ? "CAN" : "UART";
                } else if (csPinGroundedOrPulledHigh) {
                    protocol = "I2C";
                } else if (resolvedConnections.some(c => c.sensor_pin_role === "CS")) {
                    protocol = "SPI";
                } else if (resolvedConnections.some(c => ["SDI", "SCK"].includes(c.sensor_pin_role))) {
                    protocol = "I2C";
                }

                // Check for explicit instances in net names
                let explicitProtocol = null;
                for (const conn of resolvedConnections) {
                    const combinedPath = conn.net_path.join(" ").toUpperCase();
                    const match = combinedPath.match(/(I2C\d|SPI\d|USART\d|UART\d|CAN\d)/);
                    if (match) {
                        explicitProtocol = match[1];
                        break;
                    }
                }

                // DEDUCTION: If net names failed, infer from common STM32 GPIO mappings
                if (!explicitProtocol) {
                    const i2cPins = {
                        "PB6": "I2C1", "PB7": "I2C1", "PB8": "I2C1", "PB9": "I2C1",
                        "PB10": "I2C2", "PB11": "I2C2", "PF1": "I2C2", "PF0": "I2C2",
                        "PA8": "I2C3", "PC9": "I2C3"
                    };
                    const spiPins = {
                        "PA5": "SPI1", "PA6": "SPI1", "PA7": "SPI1",
                        "PB13": "SPI2", "PB14": "SPI2", "PB15": "SPI2",
                        "PB3": "SPI3", "PB4": "SPI3", "PB5": "SPI3", "PC10": "SPI3", "PC11": "SPI3", "PC12": "SPI3"
                    };
                    
                    for (const conn of resolvedConnections) {
                        if (protocol === "I2C" && i2cPins[conn.mcu_pin_name]) {
                            explicitProtocol = i2cPins[conn.mcu_pin_name];
                            break;
                        }
                        if (protocol === "SPI" && spiPins[conn.mcu_pin_name]) {
                            explicitProtocol = spiPins[conn.mcu_pin_name];
                            break;
                        }
                    }
                }

                detectedDevices.push({
                    device_type: sensorComp.category,
                    part_name: sensorComp.partValue,
                    ref_designator: sensorDes,
                    detected_protocol: protocol,
                    detected_instance: explicitProtocol,
                    pins: resolvedConnections,
                    configuration_notes: notes
                });
            }

            return {
                is_valid: true,
                total_components: Object.keys(this.components).length,
                total_nets: Object.keys(this.nets).length,
                mcu_ref: mcuRef,
                mcu_part: mcuComp.partValue,
                detected_sensors: detectedDevices,
                bom: bomSummary,
                power_nets: powerNets,
                validation_warnings: this.warnings,
                validation_errors: this.errors
            };
        } catch (e) {
            this.errors.push(e.message);
            return {
                is_valid: false,
                validation_errors: this.errors
            };
        }
    }

    tokenize() {
        const lines = this.content.split(/\r?\n/);
        let mode = null;
        let currentNet = null;

        for (const line of lines) {
            const str = line.trim();
            if (!str) continue;

            if (str.includes("<<< Component List >>>")) {
                mode = "COMPONENTS";
                continue;
            } else if (str.includes("<<< Wire List >>>")) {
                mode = "WIRES";
                continue;
            }

            if (mode === "COMPONENTS") {
                const tokens = str.split(/\s+/);
                if (tokens.length >= 2) {
                    let partVal, des, desc;
                    if (tokens.length === 2) {
                        partVal = tokens[0];
                        des = tokens[1];
                        desc = "";
                    } else {
                        let desIndex = -1;
                        for (let i = 1; i < tokens.length; i++) {
                            if (/^[A-Z]+[0-9]+[A-Z0-9_]*$/.test(tokens[i])) {
                                desIndex = i;
                                break;
                            }
                        }
                        if (desIndex !== -1 && desIndex < tokens.length) {
                            partVal = tokens.slice(0, desIndex).join(" ");
                            des = tokens[desIndex];
                            desc = tokens.slice(desIndex + 1).join(" ");
                        } else {
                            des = tokens[tokens.length - 1];
                            partVal = tokens[0];
                            desc = tokens.slice(1, -1).join(" ");
                        }
                    }
                    const category = classifyComponent(des, partVal, desc);
                    this.components[des] = { designator: des, partValue: partVal, description: desc, category };
                }
            } else if (mode === "WIRES") {
                if (str.startsWith("[") && str.includes("]")) {
                    currentNet = str.substring(str.indexOf("]") + 1).trim();
                    if (!this.nets[currentNet]) this.nets[currentNet] = [];
                } else if (currentNet && !str.startsWith("NODE")) {
                    const parts = str.split(/\s+/);
                    if (parts.length >= 3) {
                        const ref = parts[0];
                        const pinNum = parts[1];
                        const pinName = parts[2].replace(/\\/g, "");
                        const pinType = parts.length > 3 ? parts[3] : "PASSIVE";
                        const partVal = parts.length > 4 ? parts.slice(4).join(" ") : "";
                        this.nets[currentNet].push({ refDesignator: ref, pinNumber: pinNum, pinName, pinType, partValue: partVal, netName: currentNet });
                    }
                }
            }
        }
    }

    indexPins() {
        for (const [netName, pinList] of Object.entries(this.nets)) {
            for (const p of pinList) {
                if (!this.componentToPins[p.refDesignator]) this.componentToPins[p.refDesignator] = [];
                this.componentToPins[p.refDesignator].push(p);
            }
        }
    }

    findMcu() {
        for (const [des, comp] of Object.entries(this.components)) {
            if (comp.category === "MCU") return [des, comp];
        }
        for (const [des, comp] of Object.entries(this.components)) {
            if (des.startsWith("U") || des.startsWith("IC")) {
                const pins = this.componentToPins[des] || [];
                const gpioCount = pins.filter(p => /^P[A-Z]\d+/.test(p.pinName)).length;
                if (gpioCount >= 10) return [des, comp];
            }
        }
        return null;
    }

    tracePinToMcu(startRef, startPinNum, mcuRef, maxDepth = 4) {
        const startPins = (this.componentToPins[startRef] || []).filter(p => String(p.pinNumber) === String(startPinNum));
        if (startPins.length === 0) return [];

        const initialNet = startPins[0].netName;

        if (isPowerOrGroundNet(initialNet)) {
            return [{
                mcuNode: { refDesignator: "RAIL", pinNumber: "0", pinName: initialNet, pinType: "POWER", partValue: initialNet, netName: initialNet },
                path: [initialNet],
                mode: "POWER_RAIL"
            }];
        }

        const directMatches = [];
        for (const p of (this.nets[initialNet] || [])) {
            if (p.refDesignator === mcuRef && /^P[A-Z]\d+/.test(p.pinName)) {
                directMatches.push({ mcuNode: p, path: [initialNet], mode: "DIRECT_TRACE" });
            }
        }
        if (directMatches.length > 0) return directMatches;

        const visitedNets = new Set([initialNet]);
        const visitedComponents = new Set([startRef]);
        const results = [];

        const searchStep = (currentNet, currentPath, depth) => {
            if (depth > maxDepth || isPowerOrGroundNet(currentNet)) return;

            for (const node of (this.nets[currentNet] || [])) {
                const ref = node.refDesignator;
                if (ref === mcuRef && /^P[A-Z]\d+/.test(node.pinName)) {
                    results.push({ mcuNode: node, path: currentPath, mode: "BRIDGE_TRACE" });
                    return;
                }
                if (visitedComponents.has(ref)) continue;

                const comp = this.components[ref] || { category: "UNKNOWN" };
                if (["SOLDER_BRIDGE", "RESISTOR", "PASSIVE"].includes(comp.category) || ref.match(/^(SB|R|L|FB)/)) {
                    const otherPins = (this.componentToPins[ref] || []).filter(p => p.netName !== currentNet);
                    visitedComponents.add(ref);
                    for (const nextP of otherPins) {
                        const nextNet = nextP.netName;
                        if (!visitedNets.has(nextNet) && !isPowerOrGroundNet(nextNet)) {
                            visitedNets.add(nextNet);
                            searchStep(nextNet, [...currentPath, `${ref} (${nextP.pinNumber})`, nextNet], depth + 1);
                        }
                    }
                }
            }
        };

        searchStep(initialNet, [initialNet], 1);
        return results;
    }

    createResult(isValid, mcuRef, mcuPart, detectedSensors) {
        return {
            is_valid: isValid,
            total_components: Object.keys(this.components).length,
            total_nets: Object.keys(this.nets).length,
            mcu_ref: mcuRef,
            mcu_part: mcuPart,
            detected_sensors: detectedSensors,
            validation_warnings: this.warnings,
            validation_errors: this.errors
        };
    }
}
