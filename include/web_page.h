#pragma once

#include <Arduino.h>

const char INDEX_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>STM32 Flasher</title>
    <style>
        :root {
            --bg: #000000;
            --surface: rgba(18, 18, 20, 0.75);
            --surface-hover: rgba(28, 28, 32, 0.85);
            --border: rgba(255, 255, 255, 0.08);
            --border-focus: rgba(0, 122, 255, 0.5);
            --text-primary: #f5f5f7;
            --text-secondary: #86868b;
            --accent: #2997ff;
            --accent-glow: rgba(41, 151, 255, 0.25);
            --success: #30d158;
            --error: #ff453a;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", sans-serif;
            background-color: var(--bg);
            background-image: radial-gradient(circle at 50% 15%, rgba(41, 151, 255, 0.06), transparent 60%);
            color: var(--text-primary);
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 20px;
            -webkit-font-smoothing: antialiased;
        }

        .card {
            background: var(--surface);
            backdrop-filter: blur(30px);
            -webkit-backdrop-filter: blur(30px);
            border: 1px solid var(--border);
            border-radius: 20px;
            width: 100%;
            max-width: 480px;
            padding: 28px;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8), 0 0 1px rgba(255, 255, 255, 0.1);
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 24px;
        }

        .title-group h1 {
            font-size: 19px;
            font-weight: 600;
            letter-spacing: -0.02em;
            color: var(--text-primary);
        }

        .title-group p {
            font-size: 12px;
            color: var(--text-secondary);
            margin-top: 2px;
            letter-spacing: -0.01em;
        }

        .status-pill {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: rgba(48, 209, 88, 0.1);
            border: 1px solid rgba(48, 209, 88, 0.2);
            padding: 4px 10px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 500;
            color: var(--success);
        }

        .pulse-dot {
            width: 6px;
            height: 6px;
            background-color: var(--success);
            border-radius: 50%;
            box-shadow: 0 0 8px var(--success);
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0% { transform: scale(0.95); opacity: 0.8; }
            50% { transform: scale(1.3); opacity: 1; box-shadow: 0 0 12px var(--success); }
            100% { transform: scale(0.95); opacity: 0.8; }
        }

        .drop-zone {
            border: 1px dashed rgba(255, 255, 255, 0.15);
            border-radius: 14px;
            padding: 30px 20px;
            text-align: center;
            cursor: pointer;
            transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            background: rgba(255, 255, 255, 0.02);
            margin-bottom: 16px;
        }

        .drop-zone:hover, .drop-zone.dragover {
            border-color: var(--accent);
            background: rgba(41, 151, 255, 0.04);
            box-shadow: 0 0 20px var(--accent-glow);
        }

        .drop-zone svg {
            width: 32px;
            height: 32px;
            fill: none;
            stroke: var(--text-secondary);
            stroke-width: 1.5;
            margin-bottom: 10px;
            transition: stroke 0.2s;
        }

        .drop-zone:hover svg {
            stroke: var(--accent);
        }

        .drop-zone p {
            font-size: 13px;
            color: var(--text-secondary);
            font-weight: 400;
        }

        .drop-zone b {
            color: var(--text-primary);
            font-weight: 500;
        }

        .file-card {
            display: none;
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 12px 14px;
            margin-bottom: 16px;
            font-size: 12px;
        }

        .file-card .row {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .file-name {
            font-weight: 500;
            color: var(--text-primary);
            letter-spacing: -0.01em;
            word-break: break-all;
        }

        .file-badge {
            font-size: 10px;
            background: rgba(41, 151, 255, 0.15);
            color: var(--accent);
            padding: 2px 8px;
            border-radius: 6px;
            font-weight: 600;
            border: 1px solid rgba(41, 151, 255, 0.25);
        }

        .file-size {
            color: var(--text-secondary);
            font-size: 11px;
            margin-top: 4px;
        }

        button.btn-flash {
            width: 100%;
            background: var(--text-primary);
            color: #000000;
            border: none;
            padding: 13px;
            border-radius: 12px;
            font-size: 13.5px;
            font-weight: 600;
            letter-spacing: -0.01em;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            box-shadow: 0 4px 14px rgba(255, 255, 255, 0.1);
        }

        button.btn-flash:hover:not(:disabled) {
            background: #ffffff;
            transform: translateY(-1px);
            box-shadow: 0 6px 20px rgba(255, 255, 255, 0.2);
        }

        button.btn-flash:disabled {
            background: rgba(255, 255, 255, 0.08);
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
            font-size: 11.5px;
            color: var(--text-secondary);
            margin-bottom: 8px;
            font-weight: 500;
        }

        .progress-bar-bg {
            background: rgba(255, 255, 255, 0.06);
            border-radius: 10px;
            height: 4px;
            overflow: hidden;
        }

        .progress-bar-fill {
            background: linear-gradient(90deg, var(--accent), #5ac8fa);
            height: 100%;
            width: 0%;
            border-radius: 10px;
            transition: width 0.15s ease-out;
            box-shadow: 0 0 10px var(--accent-glow);
        }

        .terminal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 20px;
            margin-bottom: 8px;
            font-size: 10.5px;
            font-weight: 600;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.06em;
        }

        .terminal {
            background: #000000;
            border: 1px solid rgba(255, 255, 255, 0.07);
            border-radius: 12px;
            padding: 12px 14px;
            height: 160px;
            overflow-y: auto;
            font-family: "SF Mono", SFMono-Regular, ui-monospace, Menlo, Monaco, Consolas, monospace;
            font-size: 11px;
            line-height: 1.6;
            color: var(--text-secondary);
            scrollbar-width: thin;
            scrollbar-color: rgba(255,255,255,0.1) transparent;
        }

        .terminal::-webkit-scrollbar { width: 4px; }
        .terminal::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }

        .terminal p { margin: 0; }
        .log-info { color: #86868b; }
        .log-chunk { color: #2997ff; }
        .log-success { color: #30d158; }
        .log-error { color: #ff453a; font-weight: 600; }
    </style>
</head>
<body>
    <div class="card">
        <div class="header">
            <div class="title-group">
                <h1>STM32 Flasher</h1>
                <p>Nucleo-F446RE OTA</p>
            </div>
            <div class="status-pill">
                <span class="pulse-dot"></span>
                <span>OTA Hazır</span>
            </div>
        </div>

        <div class="drop-zone" id="dropZone" onclick="document.getElementById('fileInput').click()">
            <svg viewBox="0 0 24 24">
                <path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <p><b>.bin</b> veya <b>.elf</b> dosyasını sürükleyin</p>
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
            <span>Canlı Konsol</span>
            <span id="chunkCount" style="color: var(--accent)"></span>
        </div>
        <div class="terminal" id="terminal">
            <p class="log-info">[SİSTEM] ESP32-C3 Hazır. Dosya bekleniyor...</p>
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

        let readyBinary = null;

        function log(msg, type = 'info') {
            const p = document.createElement('p');
            p.className = `log-${type}`;
            const time = new Date().toLocaleTimeString();
            p.innerText = `[${time}] ${msg}`;
            terminal.appendChild(p);
            terminal.scrollTop = terminal.scrollHeight;
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
                        log(`ELF ayrıştırıldı: ${readyBinary.size} bayt Flash verisi hazır.`, 'chunk');
                    } else {
                        readyBinary = file;
                        fileBadge.innerText = 'RAW BIN';
                        fileSize.innerText = `${(file.size/1024).toFixed(1)} KB Flash Binary`;
                        log(`BIN yüklendi: ${readyBinary.size} bayt.`, 'info');
                    }

                    fileName.innerText = file.name;
                    fileCard.style.display = 'block';
                    flashBtn.disabled = false;
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
            flashBtn.disabled = true;
            progBar.style.width = '0%';
            pctLabel.innerText = '%0';
            statusLabel.innerText = 'Aktarılıyor...';
            log('Dosya ESP32 RAM tamponuna yükleniyor...', 'info');

            const formData = new FormData();
            formData.append('firmware', readyBinary, 'firmware.bin');

            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/upload', true);

            xhr.onload = () => {
                if (xhr.status === 200) {
                    log('Dosya RAM tamponunda. UART Flash akışı başlatılıyor...', 'info');
                    startSSEStream();
                } else {
                    log(`Yükleme hatası: ${xhr.responseText}`, 'error');
                    flashBtn.disabled = false;
                }
            };

            xhr.onerror = () => {
                log('ESP32 bağlantı hatası!', 'error');
                flashBtn.disabled = false;
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
                        statusLabel.style.color = '#30d158';
                        flashBtn.disabled = false;
                    }
                    if (data.error) {
                        evtSource.close();
                        statusLabel.innerText = 'Hata';
                        statusLabel.style.color = '#ff453a';
                        flashBtn.disabled = false;
                    }
                } catch (err) {
                    console.error(err);
                }
            };

            evtSource.onerror = () => {
                evtSource.close();
                log('Terminal akış bağlantısı kapandı.', 'info');
                flashBtn.disabled = false;
            };
        }
    </script>
</body>
</html>
)rawliteral";
