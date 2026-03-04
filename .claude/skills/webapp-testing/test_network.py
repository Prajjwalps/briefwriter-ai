#!/usr/bin/env python3
"""
Network request test
"""

from playwright.sync_api import sync_playwright
import time
import tempfile
import os

def test_network():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()

        # Track all requests
        requests_made = []
        page.on("request", lambda r: requests_made.append({
            "url": r.url,
            "method": r.method,
            "post_data": r.post_data[:100] if r.post_data else None
        }))

        # Track responses
        responses = []
        page.on("response", lambda r: responses.append({
            "url": r.url,
            "status": r.status,
        }))

        print("\n[1] Loading app...")
        page.goto('http://localhost:3001', wait_until='networkidle')
        time.sleep(1)

        # Create and upload file
        print("[2] Uploading file...")
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
            f.write("Write 100 words on Artificial Intelligence")
            temp_file = f.name

        file_input = page.locator('input[type="file"]').first
        file_input.set_input_files(temp_file)
        time.sleep(1)

        # Click Auto-Detect
        print("[3] Clicking Auto-Detect...")
        auto_btn = page.locator('button:has-text("Auto-Detect from Brief")').first
        auto_btn.click()
        time.sleep(1)

        # Wait for analysis
        print("[4] Waiting for analysis...")
        page.wait_for_load_state('networkidle')
        time.sleep(3)

        # Print network activity
        print("\n[NETWORK REQUESTS]")
        analyse_calls = [r for r in requests_made if '/api/analyse' in r['url']]
        print(f"Total /api/analyse calls: {len(analyse_calls)}")

        for req in analyse_calls:
            print(f"  {req['url']}")
            print(f"  Method: {req['method']}")

        print("\n[NETWORK RESPONSES]")
        analyse_responses = [r for r in responses if '/api/analyse' in r['url']]
        print(f"Total /api/analyse responses: {len(analyse_responses)}")

        for resp in analyse_responses:
            print(f"  {resp['url']}: {resp['status']}")

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
    test_network()
