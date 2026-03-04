#!/usr/bin/env python3
"""
File upload test with console logs
"""

from playwright.sync_api import sync_playwright
import time
import tempfile
import os

def test_file_with_logs():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()

        # Collect console logs
        logs = []
        page.on("console", lambda msg: logs.append(msg.text))

        print("\n[1] Loading app...")
        page.goto('http://localhost:3001', wait_until='networkidle')
        time.sleep(1)

        # Create and upload file
        print("[2] Creating and uploading brief file...")
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
            f.write("Write 100 words on Artificial Intelligence")
            temp_file = f.name

        file_input = page.locator('input[type="file"]').first
        file_input.set_input_files(temp_file)
        time.sleep(1)

        # Click Analyse Brief button
        print("[3] Clicking Analyse Brief...")
        analyse_btn = page.locator('button:has-text("Analyse Brief")').first
        if analyse_btn.count() > 0:
            analyse_btn.click()
            print("[OK] Button clicked")
        else:
            print("[ERROR] Analyse button not found!")
        time.sleep(1)

        # Wait for analysis
        print("[4] Waiting for analysis...")
        page.wait_for_load_state('networkidle')
        time.sleep(6)

        # Print logs
        print("\n[CONSOLE LOGS]")
        for log in logs:
            if '[DEBUG]' in log or 'error' in log.lower():
                print(f"  {log}")

        # Check button
        continue_btn = page.locator('button:has-text("Continue")').first
        button_text = continue_btn.text_content()
        is_enabled = not continue_btn.is_disabled()
        print(f"\n[Button] {button_text}")
        print(f"[Enabled] {is_enabled}")

        os.unlink(temp_file)
        input("\nPress Enter...")
        browser.close()

if __name__ == "__main__":
    test_file_with_logs()
