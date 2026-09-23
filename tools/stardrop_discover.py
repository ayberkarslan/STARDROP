#!/usr/bin/env python3
"""Discover STARDROP OTA flashers on the current local network."""

import argparse
import json
import socket
import time
import webbrowser

DISCOVERY_PORT = 4210
DISCOVERY_REQUEST = b"STARDROP_DISCOVER_V1"


def discover(timeout: float, broadcast: str):
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("", 0))
    sock.settimeout(0.15)
    sock.sendto(DISCOVERY_REQUEST, (broadcast, DISCOVERY_PORT))

    devices = {}
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            data, sender = sock.recvfrom(1024)
        except socket.timeout:
            continue
        try:
            device = json.loads(data.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            continue
        if device.get("protocol") != "stardrop-discovery-v1":
            continue
        device["replyAddress"] = sender[0]
        devices[(device.get("mac"), sender[0])] = device
    sock.close()
    return list(devices.values())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--timeout", type=float, default=2.0, help="response wait in seconds (default: 2)")
    parser.add_argument("--broadcast", default="255.255.255.255", help="broadcast address")
    parser.add_argument("--json", action="store_true", help="print JSON")
    parser.add_argument("--no-open", action="store_true", help="do not open the discovered web panel")
    args = parser.parse_args()

    devices = discover(args.timeout, args.broadcast)
    if args.json:
        print(json.dumps(devices, indent=2))
        return
    if not devices:
        print("No STARDROP devices found. Confirm the computer and ESP are on the same LAN.")
        return

    urls = []
    for device in devices:
        ip = device.get("ip", device["replyAddress"])
        url = f"http://{ip}:{device.get('httpPort', 80)}"
        urls.append(url)
        state = "STA connected" if device.get("staConnected") else "AP-only"
        print(f"{device.get('name', 'stardrop'):12} {ip:15} {state:13} {device.get('mac', '-')}  {url}")

    if not args.no_open:
        print(f"Opening {urls[0]}")
        webbrowser.open(urls[0])


if __name__ == "__main__":
    main()
