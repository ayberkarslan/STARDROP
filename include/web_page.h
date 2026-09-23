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
            --bg-pure: #000000;
            --surface-1: #090909;
            --surface-2: #111111;
            --surface-3: #181818;
            --border-dim: #222222;
            --border-mid: #333333;
            --border-bright: #666666;
            --border-focus: #ffffff;
            --text-main: #ffffff;
            --text-sub: #888888;
            --text-dim: #444444;
            --accent-white: #ffffff;
            --accent-black: #000000;
            --status-green: #30d158;
            --status-red: #ff453a;
            --status-yellow: #ffd60a;
            --font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", "Inter", sans-serif;
            --font-mono: "SF Mono", "JetBrains Mono", "Menlo", "Fira Code", monospace;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        body {
            font-family: var(--font-sans);
            background-color: var(--bg-pure);
            color: var(--text-main);
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 24px;
            -webkit-font-smoothing: antialiased;
        }

        .container {
            background: var(--surface-1);
            border: 1px solid var(--border-dim);
            border-radius: 12px;
            width: 100%;
            max-width: 480px;
            padding: 24px;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.95);
            position: relative;
        }

        /* HEADER */
        .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 24px;
            border-bottom: 1px solid var(--border-dim);
            padding-bottom: 16px;
        }

        .title-group h1 {
            font-size: 18px;
            font-weight: 800;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            color: var(--text-main);
            line-height: 1.1;
        }

        .title-group p {
            font-family: var(--font-mono);
            font-size: 10px;
            color: var(--text-sub);
            margin-top: 5px;
            letter-spacing: 0.14em;
            text-transform: uppercase;
        }

        .header-actions {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-shrink: 0;
        }

        .pill {
            font-family: var(--font-mono);
            font-size: 10px;
            font-weight: 600;
            letter-spacing: 0.04em;
            padding: 4px 10px;
            background: var(--surface-2);
            border: 1px solid var(--border-dim);
            border-radius: 6px;
            color: var(--text-sub);
            display: flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
            transition: border-color 0.2s ease, color 0.2s ease;
        }

        #netPill {
            max-width: 138px;
            white-space: nowrap;
            overflow: hidden;
        }

        #netPillText {
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .pill:hover {
            border-color: var(--border-bright);
            color: var(--text-main);
        }

        .pill .dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: var(--text-dim);
        }

        .pill.online .dot {
            background: var(--status-green);
            box-shadow: 0 0 6px var(--status-green);
        }

        .pill.offline .dot {
            background: var(--status-red);
            box-shadow: 0 0 6px var(--status-red);
        }

        .btn-settings {
            background: var(--surface-2);
            border: 1px solid var(--border-dim);
            border-radius: 6px;
            width: 26px;
            height: 26px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            color: var(--text-sub);
            font-size: 12px;
            transition: all 0.2s ease;
        }

        .btn-settings:hover {
            border-color: var(--border-bright);
            color: var(--text-main);
        }

        .target-card {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 14px;
            padding: 10px 12px;
            border: 1px solid var(--border-dim);
            border-radius: 8px;
            background: var(--surface-2);
            font-family: var(--font-mono);
        }
        .target-state { display: flex; align-items: center; gap: 7px; min-width: 0; }
        .target-dot { width: 7px; height: 7px; flex: 0 0 auto; border-radius: 50%; background: var(--text-dim); }
        .target-card.connected .target-dot { background: var(--status-green); box-shadow: 0 0 7px var(--status-green); }
        .target-card.missing .target-dot { background: var(--status-yellow); }
        .target-name { font-size: 11px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .target-detail { flex: 0 0 auto; font-size: 9px; color: var(--text-sub); text-align: right; }

        /* DROP ZONE */
        .drop-zone {
            border: 1px dashed var(--border-mid);
            border-radius: 8px;
            padding: 30px 16px;
            text-align: center;
            background: var(--surface-2);
            cursor: pointer;
            transition: border-color 0.2s ease, background-color 0.2s ease;
        }

        .drop-zone:hover, .drop-zone.dragover {
            border-color: var(--border-focus);
            border-style: solid;
            background: var(--surface-3);
        }

        .drop-zone input { display: none; }

        .drop-zone-icon {
            font-size: 24px;
            margin-bottom: 8px;
            filter: grayscale(1);
        }

        .drop-zone-title {
            font-size: 13px;
            font-weight: 700;
            letter-spacing: 0.04em;
            color: var(--text-main);
            text-transform: uppercase;
        }

        .drop-zone-sub {
            font-family: var(--font-mono);
            font-size: 10px;
            color: var(--text-sub);
            margin-top: 4px;
            letter-spacing: 0.05em;
        }

        /* FILE CARD */
        .file-card {
            display: none;
            background: var(--surface-2);
            border: 1px solid var(--border-dim);
            border-radius: 8px;
            padding: 12px 14px;
            margin-top: 12px;
        }

        .file-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .file-name {
            font-family: var(--font-mono);
            font-size: 12px;
            font-weight: 600;
            color: var(--text-main);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 280px;
        }

        .file-badge {
            font-family: var(--font-mono);
            font-size: 9px;
            font-weight: 800;
            letter-spacing: 0.08em;
            background: var(--text-main);
            color: var(--accent-black);
            padding: 2px 6px;
            border-radius: 4px;
            text-transform: uppercase;
        }

        .file-meta {
            font-family: var(--font-mono);
            font-size: 10px;
            color: var(--text-sub);
            margin-top: 4px;
        }

        /* ACTION BUTTON */
        .btn-flash {
            width: 100%;
            background: var(--accent-white);
            color: var(--accent-black);
            border: 1px solid var(--accent-white);
            border-radius: 8px;
            padding: 14px;
            font-size: 12px;
            font-weight: 800;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            cursor: pointer;
            margin-top: 14px;
            transition: opacity 0.15s ease, transform 0.15s ease;
        }

        .btn-flash:hover:not(:disabled) {
            opacity: 0.9;
            transform: translateY(-1px);
        }

        .btn-flash:disabled {
            background: var(--surface-2);
            color: var(--text-dim);
            border-color: var(--border-dim);
            cursor: not-allowed;
            transform: none;
        }

        /* PROGRESS SECTION */
        .progress-section {
            margin-top: 18px;
            display: none;
        }

        .progress-labels {
            display: flex;
            justify-content: space-between;
            font-family: var(--font-mono);
            font-size: 11px;
            font-weight: 600;
            margin-bottom: 6px;
            color: var(--text-sub);
        }

        .progress-track {
            height: 4px;
            background: var(--surface-3);
            border-radius: 2px;
            overflow: hidden;
        }

        .progress-bar {
            height: 100%;
            width: 0%;
            background: var(--accent-white);
            transition: width 0.1s linear;
        }

        .progress-meta {
            display: flex;
            justify-content: space-between;
            font-family: var(--font-mono);
            font-size: 10px;
            color: var(--text-dim);
            margin-top: 5px;
        }

        /* TERMINAL LOG */
        .terminal {
            background: var(--bg-pure);
            border: 1px solid var(--border-dim);
            border-radius: 8px;
            padding: 10px 12px;
            margin-top: 14px;
            height: 120px;
            overflow-y: auto;
            font-family: var(--font-mono);
            font-size: 11px;
            line-height: 1.5;
            color: var(--text-sub);
        }

        .terminal p { margin: 2px 0; word-break: break-all; }
        .log-info { color: var(--text-sub); }
        .log-success { color: var(--text-main); font-weight: 700; }
        .log-warn { color: var(--status-yellow); }
        .log-error { color: var(--status-red); font-weight: 700; }
        .log-chunk { color: #aaaaaa; }

        /* BRUTALIST MODAL */
        .modal-overlay {
            display: none;
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.9);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            z-index: 100;
            justify-content: center;
            align-items: center;
            padding: 16px;
        }

        .modal {
            background: var(--surface-1);
            border: 1px solid var(--border-dim);
            border-radius: 12px;
            width: 100%;
            max-width: 440px;
            padding: 20px;
            box-shadow: 0 25px 50px rgba(0, 0, 0, 1);
            max-height: 85vh;
            overflow-y: auto;
        }

        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            border-bottom: 1px solid var(--border-dim);
            padding-bottom: 12px;
        }

        .modal-header h2 {
            font-size: 13px;
            font-weight: 800;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            color: var(--text-main);
        }

        .btn-close {
            background: transparent;
            border: none;
            color: var(--text-sub);
            font-family: var(--font-mono);
            font-size: 14px;
            cursor: pointer;
        }

        .btn-close:hover { color: var(--text-main); }

        .net-card {
            background: var(--surface-2);
            border: 1px solid var(--border-dim);
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 14px;
        }

        .net-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 6px;
            font-family: var(--font-mono);
            font-size: 11px;
        }

        .net-row:last-child { margin-bottom: 0; }

        .sig-bars {
            display: flex;
            align-items: flex-end;
            gap: 2px;
            height: 10px;
        }

        .sig-bar {
            width: 2.5px;
            background: var(--border-mid);
            border-radius: 1px;
        }
        .sig-bar.b1 { height: 3px; }
        .sig-bar.b2 { height: 5px; }
        .sig-bar.b3 { height: 7px; }
        .sig-bar.b4 { height: 10px; }

        .sig-bar.active {
            background: var(--text-main);
        }

        .section-label {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-family: var(--font-mono);
            font-size: 10px;
            font-weight: 700;
            color: var(--text-sub);
            text-transform: uppercase;
            letter-spacing: 0.08em;
            margin-bottom: 8px;
            margin-top: 14px;
        }

        .btn-sm-scan {
            background: var(--surface-2);
            border: 1px solid var(--border-mid);
            color: var(--text-main);
            border-radius: 4px;
            padding: 2px 6px;
            font-family: var(--font-mono);
            font-size: 9px;
            font-weight: 700;
            cursor: pointer;
            text-transform: uppercase;
        }

        .btn-sm-scan:hover { background: var(--border-bright); }

        .list-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 10px;
            background: var(--surface-2);
            border: 1px solid var(--border-dim);
            border-radius: 6px;
            margin-bottom: 5px;
            font-family: var(--font-mono);
            font-size: 11px;
        }

        .list-actions {
            display: flex;
            align-items: center;
            gap: 5px;
        }

        .btn-connect {
            background: var(--text-main);
            color: var(--accent-black);
            border: none;
            border-radius: 4px;
            padding: 3px 8px;
            font-family: var(--font-mono);
            font-size: 9px;
            font-weight: 800;
            cursor: pointer;
            text-transform: uppercase;
        }

        .btn-connect:hover { opacity: 0.85; }

        .btn-del {
            background: transparent;
            border: 1px solid var(--border-mid);
            color: var(--text-sub);
            border-radius: 4px;
            padding: 3px 6px;
            font-family: var(--font-mono);
            font-size: 9px;
            cursor: pointer;
        }

        .btn-del:hover { border-color: var(--status-red); color: var(--status-red); }

        .input-text {
            width: 100%;
            background: var(--surface-2);
            border: 1px solid var(--border-dim);
            border-radius: 6px;
            padding: 8px 10px;
            color: var(--text-main);
            font-family: var(--font-mono);
            font-size: 11px;
            margin-bottom: 6px;
            outline: none;
        }

        .input-text:focus { border-color: var(--border-focus); }

        .setting-select {
            width: 100%;
            appearance: none;
            background: var(--surface-2);
            border: 1px solid var(--border-dim);
            border-radius: 6px;
            padding: 9px 10px;
            color: var(--text-main);
            font-family: var(--font-mono);
            font-size: 11px;
            outline: none;
        }

        .setting-note {
            font-family: var(--font-mono);
            font-size: 10px;
            color: var(--text-sub);
            line-height: 1.45;
            margin-top: 7px;
        }

        .btn-submit {
            width: 100%;
            background: var(--surface-3);
            color: var(--text-main);
            border: 1px solid var(--border-mid);
            border-radius: 6px;
            padding: 8px;
            font-family: var(--font-mono);
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            cursor: pointer;
            margin-top: 2px;
        }

        .btn-submit:hover {
            border-color: var(--border-focus);
            background: var(--border-mid);
        }
        .btn-submit:disabled { opacity: .42; cursor: not-allowed; }

        .notice-overlay {
            display: none;
            position: fixed;
            inset: 0;
            z-index: 200;
            align-items: center;
            justify-content: center;
            padding: 20px;
            background: rgba(0, 0, 0, 0.72);
            backdrop-filter: blur(5px);
        }

        .notice-card {
            width: 100%;
            max-width: 360px;
            background: var(--surface-1);
            border: 1px solid var(--border-mid);
            border-radius: 10px;
            padding: 18px;
            box-shadow: 0 24px 55px rgba(0, 0, 0, 0.75);
        }

        .notice-head { display: flex; align-items: center; gap: 9px; }
        .notice-mark { width: 8px; height: 8px; border-radius: 50%; background: var(--status-green); box-shadow: 0 0 8px var(--status-green); }
        .notice-mark.error { background: var(--status-red); box-shadow: 0 0 8px var(--status-red); }
        .notice-mark.warn { background: var(--status-yellow); box-shadow: 0 0 8px var(--status-yellow); }
        .notice-title { font-family: var(--font-mono); font-weight: 800; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
        .notice-message { margin: 11px 0 16px; font-family: var(--font-mono); font-size: 11px; color: var(--text-sub); line-height: 1.5; }
        .notice-actions { display: flex; justify-content: flex-end; gap: 7px; }
        .notice-btn { border: 1px solid var(--border-mid); border-radius: 5px; background: var(--surface-3); color: var(--text-main); padding: 7px 12px; font: 800 10px var(--font-mono); letter-spacing: .06em; cursor: pointer; }
        .notice-btn.primary { background: var(--text-main); color: var(--accent-black); border-color: var(--text-main); }
    </style>
</head>
<body>
    <div class="container">
        <!-- HEADER -->
        <div class="header">
            <div class="title-group">
                <h1>STARDROP</h1>
                <p>Yıldız Roket Takımı • Aviyonik OTA</p>
            </div>
            <div class="header-actions">
                <div class="pill" id="netPill" onclick="openNetworkModal()" title="Wi-Fi">
                    <span id="netPillText">WI-FI</span>
                </div>
                <div class="pill offline" id="statusPill">
                    <div class="dot"></div>
                    <span id="statusText">BAĞLANIYOR</span>
                </div>
                <button class="btn-settings" onclick="openNetworkModal()" title="Sistem ayarları">⚙</button>
            </div>
        </div>

        <!-- DROP ZONE -->
        <div class="target-card" id="targetCard">
            <div class="target-state"><span class="target-dot"></span><span class="target-name" id="targetName">STM32 HEDEFİ TARANIYOR...</span></div>
            <span class="target-detail" id="targetDetail">SWD</span>
        </div>
        <div class="drop-zone" id="dropZone" onclick="document.getElementById('fileInput').click()">
            <input type="file" id="fileInput" accept=".bin,.elf">
            <div class="drop-zone-icon">⏏</div>
            <div class="drop-zone-title">Firmware Dosyası Seç</div>
            <div class="drop-zone-sub">.ELF VEYA .BIN SÜRÜKLEYİN</div>
        </div>

        <!-- FILE INFO -->
        <div class="file-card" id="fileCard">
            <div class="file-row">
                <span class="file-name" id="fileName">-</span>
                <span class="file-badge" id="fileBadge">RAW BIN</span>
            </div>
            <div class="file-meta" id="fileSize">0 KB</div>
        </div>

        <!-- FLASH ACTION -->
        <button class="btn-flash" id="flashBtn" disabled onclick="startFlash()">YAZILIMI YÜKLE (SWD)</button>

        <!-- PROGRESS -->
        <div class="progress-section" id="progSection">
            <div class="progress-labels">
                <span id="statusLabel">HAZIRLANIYOR...</span>
                <span id="pctLabel">0%</span>
            </div>
            <div class="progress-track">
                <div class="progress-bar" id="progBar"></div>
            </div>
            <div class="progress-meta">
                <span id="speedLabel">SWD AUTO</span>
                <span id="chunkCount"></span>
            </div>
        </div>

        <!-- TERMINAL -->
        <div class="terminal" id="terminal">
            <p class="log-info">[STARDROP] YRT Aviyonik SWD İstasyonu Hazır. Yazılım bekleniyor...</p>
        </div>
    </div>

    <!-- MODAL -->
    <div class="modal-overlay" id="netModal">
        <div class="modal">
            <div class="modal-header">
                <h2>Sistem Ayarları</h2>
                <button class="btn-close" onclick="closeNetworkModal()">✕</button>
            </div>

            <div class="section-label">Programlayıcı</div>
            <div class="net-card">
                <div class="net-row">
                    <span style="color: var(--text-sub);">SWD HIZ PROFİLİ:</span>
                    <span id="speedActiveText" style="font-weight:700;">-</span>
                </div>
                <select class="setting-select" id="speedMode" onchange="markSettingsDirty()">
                    <option value="auto">AUTO · Maksimum güvenli</option>
                    <option value="turbo">TURBO · En kısa kenar aralığı</option>
                    <option value="fast">FAST · Günlük kullanım</option>
                    <option value="safe">SAFE · Uzun kablo / breadboard</option>
                </select>
                <p class="setting-note">AUTO önce TURBO'yu dener; kararsızlıkta FAST ve SAFE'e iner. Her blok geri okunur ve doğrulanır.</p>
                <div class="net-row" style="margin-top:10px;">
                    <span style="color: var(--text-sub);">SON HEDEF:</span>
                    <span id="targetIdText" style="font-weight:700;">-</span>
                </div>
                <div class="net-row">
                    <span style="color: var(--text-sub);">SON İŞLEM:</span>
                    <span id="lastFlashText" style="font-weight:700; text-align:right; max-width:220px;">-</span>
                </div>
                <p class="setting-note" id="diagnosticsText">Doğrulama: zorunlu.</p>
                <div class="section-label" style="margin-top:12px;">Algılanan Hedefi Adlandır</div>
                <input type="text" class="input-text" id="targetLabelInput" maxlength="32" placeholder="Örn. TELEMETRİ KARTI">
                <button class="btn-submit" id="saveTargetLabelBtn" onclick="saveCurrentTargetLabel()" disabled>Hedef Adını Kaydet</button>
                <p class="setting-note" id="targetUidText">Önce SWD hedefi algılanmalı.</p>
            </div>

            <!-- AKTİF BAĞLANTI -->
            <div class="section-label">Ağ</div>
            <div class="net-card">
                <div class="net-row">
                    <span style="color: var(--text-sub);">AKTİF AĞ:</span>
                    <span style="font-weight: 700; color: var(--text-main);" id="curSsidText">-</span>
                </div>
                <div class="net-row">
                    <span style="color: var(--text-sub);">IP ADRESİ:</span>
                    <a href="#" id="curIpLink" target="_blank" style="font-weight: 700; color: var(--text-main); text-decoration: none;">-</a>
                </div>
                <div class="net-row">
                    <span style="color: var(--text-sub);">SİNYAL GÜCÜ:</span>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <div class="sig-bars" id="curSigBars">
                            <div class="sig-bar b1"></div>
                            <div class="sig-bar b2"></div>
                            <div class="sig-bar b3"></div>
                            <div class="sig-bar b4"></div>
                        </div>
                        <span id="curSigText" style="font-weight: 700;">-</span>
                    </div>
                </div>
            </div>

            <!-- KAYITLI AĞLAR -->
            <div class="section-label">Kayıtlı Ağlar & Hızlı Geçiş</div>
            <div id="savedNetworksList">
                <p style="font-family: var(--font-mono); font-size: 11px; color: var(--text-sub);">Yükleniyor...</p>
            </div>

            <!-- ÇEVREDEKİ AĞLAR -->
            <div class="section-label">
                <span>Çevredeki Ağlar</span>
                <button class="btn-sm-scan" onclick="scanNearbyNetworks()" id="btnScan">TARA</button>
            </div>
            <div id="scannedNetworksList" style="max-height: 110px; overflow-y: auto; margin-bottom: 10px;"></div>

            <!-- YENİ AĞ EKLE -->
            <div class="section-label">Yeni Ağ Ekle</div>
            <input type="text" class="input-text" id="newSsid" placeholder="Wi-Fi Adı (SSID)">
            <input type="password" class="input-text" id="newPass" placeholder="Wi-Fi Şifresi">
            <button class="btn-submit" onclick="saveNewNetwork()">Ağı Kaydet</button>
            <p class="setting-note">Kaydettikten sonra üstteki listeden istediğin ağa <b>BAĞLAN</b> diyebilirsin.</p>
            <button class="btn-submit" id="saveSettingsBtn" onclick="saveProgrammerSettings()" style="margin-top:18px;">Ayarları Kaydet</button>
        </div>
    </div>

    <div class="notice-overlay" id="noticeModal" role="dialog" aria-modal="true">
        <div class="notice-card">
            <div class="notice-head">
                <span class="notice-mark" id="noticeMark"></span>
                <span class="notice-title" id="noticeTitle">BİLDİRİM</span>
            </div>
            <p class="notice-message" id="noticeMessage"></p>
            <div class="notice-actions">
                <button class="notice-btn" id="noticeCancel" onclick="closeNotice()">VAZGEÇ</button>
                <button class="notice-btn primary" id="noticeConfirm" onclick="confirmNotice()">TAMAM</button>
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
        const progSection = document.getElementById('progSection');
        const progBar = document.getElementById('progBar');
        const statusLabel = document.getElementById('statusLabel');
        const pctLabel = document.getElementById('pctLabel');
        const terminal = document.getElementById('terminal');
        const chunkCount = document.getElementById('chunkCount');
        const statusPill = document.getElementById('statusPill');
        const statusText = document.getElementById('statusText');
        const netPillText = document.getElementById('netPillText');
        const netModal = document.getElementById('netModal');
        const savedNetworksList = document.getElementById('savedNetworksList');
        const scannedNetworksList = document.getElementById('scannedNetworksList');
        const curSsidText = document.getElementById('curSsidText');
        const curIpLink = document.getElementById('curIpLink');
        const curSigText = document.getElementById('curSigText');
        const curSigBars = document.getElementById('curSigBars');
        const speedMode = document.getElementById('speedMode');
        const speedLabel = document.getElementById('speedLabel');
        const speedActiveText = document.getElementById('speedActiveText');
        const targetIdText = document.getElementById('targetIdText');
        const lastFlashText = document.getElementById('lastFlashText');
        const diagnosticsText = document.getElementById('diagnosticsText');
        const noticeModal = document.getElementById('noticeModal');
        const noticeMark = document.getElementById('noticeMark');
        const noticeTitle = document.getElementById('noticeTitle');
        const noticeMessage = document.getElementById('noticeMessage');
        const noticeCancel = document.getElementById('noticeCancel');
        const noticeConfirm = document.getElementById('noticeConfirm');
        const saveSettingsBtn = document.getElementById('saveSettingsBtn');
        const targetCard = document.getElementById('targetCard');
        const targetName = document.getElementById('targetName');
        const targetDetail = document.getElementById('targetDetail');
        const targetLabelInput = document.getElementById('targetLabelInput');
        const targetUidText = document.getElementById('targetUidText');
        const saveTargetLabelBtn = document.getElementById('saveTargetLabelBtn');

        let readyBinary = null;
        let isFlashing = false;
        let wasOnline = false;
        let noticeAction = null;
        let settingsDirty = false;
        let currentTarget = null;

        function showNotice(title, message, type = 'info', onConfirm = null) {
            noticeTitle.innerText = title;
            noticeMessage.innerText = message;
            noticeMark.className = `notice-mark ${type === 'error' ? 'error' : type === 'warn' ? 'warn' : ''}`;
            noticeAction = onConfirm;
            noticeCancel.style.display = onConfirm ? 'inline-block' : 'none';
            noticeConfirm.innerText = onConfirm ? 'ONAYLA' : 'TAMAM';
            noticeModal.style.display = 'flex';
        }

        function closeNotice() {
            noticeAction = null;
            noticeModal.style.display = 'none';
        }

        function confirmNotice() {
            const action = noticeAction;
            closeNotice();
            if (action) action();
        }

        function log(msg, type = 'info') {
            const p = document.createElement('p');
            p.className = `log-${type}`;
            const time = new Date().toLocaleTimeString();
            p.innerText = `[${time}] ${msg}`;
            terminal.appendChild(p);
            terminal.scrollTop = terminal.scrollHeight;
        }

        function renderSignalBars(container, pct) {
            const bars = container.querySelectorAll('.sig-bar');
            bars.forEach((b, idx) => {
                const threshold = (idx + 1) * 25;
                if (pct >= threshold - 15) {
                    b.classList.add('active');
                } else {
                    b.classList.remove('active');
                }
            });
        }

        async function checkConnection() {
            if (isFlashing) return;
            const start = performance.now();
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2000);
                
                const res = await fetch('/ping', { signal: controller.signal, cache: 'no-store' });
                clearTimeout(timeoutId);

                if (res.ok) {
                    const latency = Math.round(performance.now() - start);
                    statusPill.className = 'pill online';
                    statusText.innerText = `${latency}MS`;
                    if (!wasOnline) {
                        log(`ESP32 aktif (${latency}ms).`, 'success');
                        wasOnline = true;
                        updateLiveWifiStatus();
                    }
                    if (readyBinary && !isFlashing) {
                        flashBtn.disabled = false;
                    }
                } else {
                    throw new Error();
                }
            } catch (err) {
                statusPill.className = 'pill offline';
                statusText.innerText = 'KOPTU';
                flashBtn.disabled = true;
                if (wasOnline) {
                    log('ESP32 bağlantısı kesildi!', 'error');
                    wasOnline = false;
                }
            }
        }

        async function updateLiveWifiStatus() {
            try {
                const res = await fetch('/api/wifi/status', { cache: 'no-store' });
                const data = await res.json();
                if (data.connected && data.ssid) {
                    netPillText.innerText = data.ssid.toUpperCase();
                    curSsidText.innerText = data.ssid;
                    curIpLink.innerText = `${data.ip} (stardrop.local)`;
                    curIpLink.href = `http://${data.ip}`;
                    curSigText.innerText = `${data.rssi} dBm (${data.pct}%)`;
                    renderSignalBars(curSigBars, data.pct);
                } else {
                    netPillText.innerText = `AP: ${data.apSsid}`;
                    curSsidText.innerText = `${data.apSsid} (AP)`;
                    curIpLink.innerText = `${data.apIp} (stardrop.local)`;
                    curIpLink.href = `http://${data.apIp}`;
                    curSigText.innerText = 'Yerel erişim noktası';
                    renderSignalBars(curSigBars, 0);
                }
            } catch (e) {}
        }

        async function updateTargetStatus() {
            if (isFlashing) return;
            targetCard.className = 'target-card';
            targetName.innerText = 'STM32 HEDEFİ TARANIYOR...';
            targetDetail.innerText = 'SWD';
            try {
                const res = await fetch('/api/target/status', { cache: 'no-store' });
                if (!res.ok) throw new Error();
                const target = await res.json();
                if (!target.connected) {
                    currentTarget = null;
                    targetCard.className = 'target-card missing';
                    targetName.innerText = 'STM32 HEDEFİ BULUNAMADI';
                    targetDetail.innerText = `ACK ${target.ack ?? '-'}`;
                    targetUidText.innerText = 'Önce SWD hedefi algılanmalı.';
                    saveTargetLabelBtn.disabled = true;
                    return;
                }
                currentTarget = target;
                targetCard.className = 'target-card connected';
                targetName.innerText = target.label || target.model;
                targetDetail.innerText = `${target.model} · ${target.flashSizeKb} KB`;
                targetCard.title = `DPIDR ${target.dpIdcode} · Revizyon ${target.revisionId}`;
                targetLabelInput.value = target.label || '';
                targetUidText.innerText = `UID: ${target.uid}`;
                saveTargetLabelBtn.disabled = false;
            } catch (e) {
                currentTarget = null;
                targetCard.className = 'target-card missing';
                targetName.innerText = 'STM32 DURUMU OKUNAMADI';
                targetDetail.innerText = 'SWD';
            }
        }

        async function saveCurrentTargetLabel() {
            if (!currentTarget) {
                showNotice('Hedef bulunamadı', 'Kart adı kaydetmeden önce STM32 hedefinin SWD ile algılanması gerekir.', 'warn');
                return;
            }
            const label = targetLabelInput.value.trim();
            if (!label) {
                showNotice('Kart adı gerekli', 'Örneğin TELEMETRİ KARTI gibi kısa bir ad gir.', 'warn');
                return;
            }
            try {
                const res = await fetch('/api/target/label', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ label })
                });
                if (!res.ok) throw new Error();
                currentTarget.label = label;
                targetName.innerText = label;
                showNotice('Hedef adlandırıldı', `'${label}' bu STM32'nin değişmeyen UID'sine bağlandı.`, 'info');
            } catch (e) {
                showNotice('Kart adı kaydedilemedi', 'ESP32 hedef kaydını güncelleyemedi.', 'error');
            }
        }

        setInterval(checkConnection, 2000);
        setInterval(updateLiveWifiStatus, 5000);
        setInterval(updateTargetStatus, 10000);
        checkConnection();
        updateLiveWifiStatus();
        loadProgrammerStatus();
        updateTargetStatus();

        function openNetworkModal() {
            netModal.style.display = 'flex';
            loadNetworkStatus();
            loadProgrammerStatus();
        }

        async function loadProgrammerStatus() {
            try {
                const res = await fetch('/api/programmer/status', { cache: 'no-store' });
                if (!res.ok) throw new Error();
                const data = await res.json();
                speedMode.value = data.speedMode;
                settingsDirty = false;
                saveSettingsBtn.innerText = 'AYARLARI KAYDET';
                speedLabel.innerText = `SWD ${data.speedMode.toUpperCase()}`;
                speedActiveText.innerText = data.speedMode.toUpperCase();
                targetIdText.innerText = data.lastTargetIdcode || '-';
                lastFlashText.innerText = `${data.lastResult || '-'} · ${data.lastProfile || '-'}`;
                const resetText = data.resetAvailable ? 'NRST bağlı' : 'yalnız SWCLK + SWDIO';
                diagnosticsText.innerText = `Doğrulama: zorunlu · ${resetText} · ${data.lastDiagnostics || '-'}`;
            } catch (e) {
                diagnosticsText.innerText = 'Programlayıcı durumu alınamadı.';
            }
        }

        function markSettingsDirty() {
            settingsDirty = true;
            saveSettingsBtn.innerText = 'DEĞİŞİKLİKLERİ KAYDET';
        }

        async function saveProgrammerSettings() {
            const selected = speedMode.value;
            try {
                const res = await fetch('/api/programmer/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ speedMode: selected })
                });
                if (!res.ok) throw new Error();
                speedLabel.innerText = `SWD ${selected.toUpperCase()}`;
                speedActiveText.innerText = selected.toUpperCase();
                settingsDirty = false;
                saveSettingsBtn.innerText = 'AYARLARI KAYDET';
                log(`SWD hız profili kaydedildi: ${selected.toUpperCase()}.`, 'success');
                showNotice('Ayarlar kaydedildi', `SWD hız profili: ${selected.toUpperCase()}. Bu seçim sonraki programlamada kullanılacak.`, 'info');
            } catch (e) {
                showNotice('Ayar kaydedilemedi', 'Hız profili ESP32 belleğine yazılamadı. Bağlantıyı kontrol edip tekrar dene.', 'error');
                loadProgrammerStatus();
            }
        }

        function closeNetworkModal() {
            netModal.style.display = 'none';
        }

        async function loadNetworkStatus() {
            try {
                const res = await fetch('/api/wifi/status', { cache: 'no-store' });
                const data = await res.json();
                savedNetworksList.innerHTML = '';
                
                if (data.saved && data.saved.length > 0) {
                    data.saved.forEach(s => {
                        const isCurrent = data.connected && data.ssid === s;
                        const div = document.createElement('div');
                        div.className = 'list-item';
                        div.innerHTML = `
                            <span><b>${s}</b> ${isCurrent ? '<span style="color:var(--status-green); font-size:9px; font-weight:800; margin-left:6px;">[AKTİF]</span>' : ''}</span>
                            <div class="list-actions">
                                ${!isCurrent ? `<button class="btn-connect" onclick="switchToNetwork('${s}')">Bağlan</button>` : ''}
                                <button class="btn-del" onclick="deleteNetwork('${s}')">Sil</button>
                            </div>`;
                        savedNetworksList.appendChild(div);
                    });
                } else {
                    savedNetworksList.innerHTML = '<p style="font-family: var(--font-mono); font-size: 11px; color: var(--text-sub);">Kayıtlı ağ yok.</p>';
                }
            } catch (e) {
                savedNetworksList.innerHTML = '<p style="color:var(--status-red); font-size:11px;">Ağ listesi alınamadı!</p>';
            }
        }

        async function switchToNetwork(ssid) {
            log(`'${ssid}' ağına geçiş yapılıyor...`, 'warn');
            try {
                const res = await fetch('/api/wifi/switch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ssid: ssid })
                });
                if (!res.ok) throw new Error();
                showNotice('Ağ geçişi başladı', `'${ssid}' ağına bağlanılması deneniyor. Panel kısa süreliğine erişilemez olabilir.`, 'info');
                setTimeout(() => {
                    loadNetworkStatus();
                    updateLiveWifiStatus();
                }, 3000);
            } catch (e) {
                showNotice('Ağ geçişi başlatılamadı', 'ESP32 isteği kabul etmedi. Kayıtlı ağ listesini yenileyip tekrar dene.', 'error');
            }
        }

        async function scanNearbyNetworks() {
            const btn = document.getElementById('btnScan');
            btn.innerText = '...';
            scannedNetworksList.innerHTML = '<p style="font-family: var(--font-mono); font-size: 11px; color: var(--text-sub);">Taranıyor...</p>';
            try {
                const res = await fetch('/api/wifi/scan', { cache: 'no-store' });
                const list = await res.json();
                scannedNetworksList.innerHTML = '';
                if (list && list.length > 0) {
                    list.forEach(net => {
                        const div = document.createElement('div');
                        div.className = 'list-item';
                        div.style.cursor = 'pointer';
                        div.onclick = () => {
                            document.getElementById('newSsid').value = net.ssid;
                            document.getElementById('newPass').focus();
                        };
                        div.innerHTML = `
                            <span>${net.secure ? '🔒' : '🔓'} <b>${net.ssid}</b></span>
                            <span style="color:var(--text-sub); font-size:10px;">${net.pct || 80}%</span>`;
                        scannedNetworksList.appendChild(div);
                    });
                } else {
                    scannedNetworksList.innerHTML = '<p style="font-family: var(--font-mono); font-size: 11px; color: var(--text-sub);">Ağ bulunamadı.</p>';
                }
            } catch (e) {
                scannedNetworksList.innerHTML = '<p style="color:var(--status-red); font-size:11px;">Tarama başarısız!</p>';
            }
            btn.innerText = 'TARA';
        }

        async function saveNewNetwork() {
            const ssid = document.getElementById('newSsid').value.trim();
            const pass = document.getElementById('newPass').value.trim();
            if (!ssid) {
                showNotice('Wi-Fi adı gerekli', 'Bu bölüm yeni bir Wi-Fi ağı eklemek içindir. Zaten bağlı olduğun ağı değiştirmek için bir işlem yapmana gerek yok.', 'warn');
                return;
            }

            try {
                const res = await fetch('/api/wifi/add', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ssid: ssid, pass: pass })
                });
                if (!res.ok) throw new Error();
                document.getElementById('newSsid').value = '';
                document.getElementById('newPass').value = '';
                showNotice('Ağ kaydedildi', `'${ssid}' kayıtlı ağlara eklendi. Bağlanmak için üstteki listeden BAĞLAN düğmesini kullan.`, 'info');
                loadNetworkStatus();
                updateLiveWifiStatus();
            } catch (e) {
                showNotice('Ağ kaydedilemedi', 'ESP32 yeni ağ bilgisini kabul etmedi. SSID ve şifreyi kontrol edip tekrar dene.', 'error');
            }
        }

        async function deleteNetwork(ssid) {
            showNotice('Kayıtlı ağı sil', `'${ssid}' kaydı silinsin mi? Aktif bağlantı hemen kesilmez; sonraki yeniden bağlanmada kullanılmaz.`, 'warn', async () => {
            try {
                const res = await fetch('/api/wifi/remove', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ssid: ssid })
                });
                if (!res.ok) throw new Error();
                loadNetworkStatus();
            } catch (e) {
                showNotice('Ağ silinemedi', 'ESP32 kayıtlı ağ listesini güncelleyemedi.', 'error');
            }
            });
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
                throw new Error("Geçersiz ELF!");
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

            if (flashSegments.length === 0) throw new Error("Flash bölümü yok!");

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
                showNotice('Geçersiz dosya', 'Yalnızca .bin veya .elf firmware dosyası seçebilirsin.', 'error');
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    if (isElf) {
                        const rawBin = parseElf(e.target.result);
                        readyBinary = new Blob([rawBin], { type: 'application/octet-stream' });
                        fileBadge.innerText = 'ELF ➔ BIN';
                        fileSize.innerText = `${(file.size/1024).toFixed(1)} KB ELF ➔ ${(readyBinary.size/1024).toFixed(1)} KB FLASH`;
                        log(`ELF ayrıştırıldı: ${readyBinary.size} bayt Flash verisi hazırlandı.`, 'chunk');
                    } else {
                        readyBinary = file;
                        fileBadge.innerText = 'RAW BIN';
                        fileSize.innerText = `${(file.size/1024).toFixed(1)} KB BINARY`;
                        log(`BIN hazır: ${readyBinary.size} bayt.`, 'info');
                    }

                    fileName.innerText = file.name;
                    fileCard.style.display = 'block';
                    if (wasOnline) flashBtn.disabled = false;
                } catch (err) {
                    showNotice('ELF ayrıştırma hatası', err.message, 'error');
                    log(`Hata: ${err.message}`, 'error');
                    readyBinary = null;
                    flashBtn.disabled = true;
                }
            };
            reader.readAsArrayBuffer(file);
        }

        async function startFlash() {
            if (!readyBinary || isFlashing) return;
            isFlashing = true;
            flashBtn.disabled = true;
            progSection.style.display = 'block';
            progBar.style.width = '0%';
            pctLabel.innerText = '0%';
            statusLabel.innerText = 'BELLEĞE AKTARILIYOR...';
            terminal.innerHTML = '';

            log('Yazılım ESP32 belleğine aktarılıyor...', 'info');

            try {
                const formData = new FormData();
                formData.append('file', readyBinary, 'firmware.bin');

                const uploadRes = await fetch('/upload', { method: 'POST', body: formData });
                if (!uploadRes.ok) throw new Error('Bellek aktarım hatası!');

                log('Yazılım belleğe alındı. SWD Flash akışı başlıyor...', 'success');
                statusLabel.innerText = 'SWD AKIŞI BAŞLIYOR...';

                const evSource = new EventSource('/stream-flash');

                evSource.onmessage = (event) => {
                    const data = JSON.parse(event.data);

                    if (data.msg) {
                        log(data.msg, data.type || 'info');
                    }

                    if (data.pct !== undefined && data.pct >= 0) {
                        progBar.style.width = `${data.pct}%`;
                        pctLabel.innerText = `${data.pct}%`;
                        if (data.pct < 20) statusLabel.innerText = 'SWD BAĞLANTI...';
                        else if (data.pct < 95) statusLabel.innerText = 'FLASH YAZILIYOR...';
                        else statusLabel.innerText = 'DOĞRULANIYOR...';
                    }

                    if (data.chunks) {
                        chunkCount.innerText = data.chunks;
                    }

                    if (data.done) {
                        evSource.close();
                        isFlashing = false;
                        flashBtn.disabled = false;
                        statusLabel.innerText = 'BAŞARILI';
                        log('🎉 STM32 başarıyla programlandı ve çalıştırıldı!', 'success');
                        loadProgrammerStatus();
                    }

                    if (data.error) {
                        evSource.close();
                        isFlashing = false;
                        flashBtn.disabled = false;
                        statusLabel.innerText = 'HATA';
                        loadProgrammerStatus();
                    }
                };

                evSource.onerror = () => {
                    evSource.close();
                    isFlashing = false;
                    flashBtn.disabled = false;
                    statusLabel.innerText = 'KESİLDİ';
                    log('SSE Veri akışı sonlandı.', 'warn');
                };

            } catch (err) {
                log(`Hata: ${err.message}`, 'error');
                isFlashing = false;
                flashBtn.disabled = false;
                statusLabel.innerText = 'İPTAL';
            }
        }
    </script>
</body>
</html>
)rawliteral";
