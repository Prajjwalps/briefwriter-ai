#!/usr/bin/env python3
"""
Test to check browser console for debug messages
"""

from playwright.sync_api import sync_playwright
import time

def test_console():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()

        # Track console messages
        console_logs = []
        page.on("console", lambda msg: console_logs.append({
            "type": msg.type,
            "text": msg.text,
            "location": msg.location
        }))

        print("\n[1] Loading app...")
        page.goto('http://localhost:3001', wait_until='networkidle')
        time.sleep(1)

        print("[2] Entering brief...")
        textarea = page.locator('textarea').first
        textarea.fill("Write 100 words on Artificial Intelligence")
        time.sleep(0.5)

        print("[3] Waiting for logs...")
        time.sleep(2)

        print("\n[CONSOLE LOGS]")
        for log in console_logs:
            print(f"  {log['type']}: {log['text']}")

        if any('[DEBUG]' in log['text'] for log in console_logs):
            print("\n[OK] DEBUG log found - fix is active!")
        else:
            print("\n[WARN] DEBUG log NOT found - fix might not be active")

        # Check page content
        content = page.content()
        if "hasBriefContent should be true" in content:
            print("[OK] DEBUG text found in page HTML")
        else:
            print("[WARN] DEBUG text NOT in page HTML")

        input("\nPress Enter...")
        browser.close()

if __name__ == "__main__":
    test_console()
