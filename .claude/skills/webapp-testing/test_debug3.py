#!/usr/bin/env python3
"""
Debug test 3: Properly trigger React onChange event
"""

from playwright.sync_api import sync_playwright
import time

def test_debug3():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()

        print("\n" + "="*70)
        print("DEBUG TEST 3: Trigger React onChange properly")
        print("="*70)

        # STEP 1: Load
        print("\n[1] Loading app...")
        page.goto('http://localhost:3001', wait_until='networkidle')
        time.sleep(1)
        print("[OK] App loaded")

        # STEP 2: Focus textarea and type with proper events
        print("\n[2] Typing into textarea with proper React event handling...")
        textarea = page.locator('textarea').first

        # Click to focus
        textarea.click()
        time.sleep(0.2)

        # Type slowly to allow React to process each character
        test_text = "Write 100 words on Artificial Intelligence"
        textarea.type(test_text, delay=20)
        time.sleep(0.5)
        print(f"[OK] Typed: '{test_text}'")

        # STEP 3: Check textarea value
        print("\n[3] Checking textarea value...")
        textarea_value = textarea.input_value()
        print(f"[INFO] Textarea value: '{textarea_value}'")
        print(f"[INFO] Match: {textarea_value == test_text}")

        # STEP 4: Check Continue button
        print("\n[4] Checking Continue button...")
        continue_btn = page.locator('button:has-text("Continue")').first
        button_text = continue_btn.text_content()
        is_enabled = not continue_btn.is_disabled()
        print(f"[INFO] Button text: '{button_text}'")
        print(f"[INFO] Button enabled: {is_enabled}")

        if not is_enabled:
            print("[WARN] Continue button still disabled after typing!")

        # STEP 5: Try switching to text mode first
        print("\n[5] Trying to switch to text input mode...")
        mode_toggle = page.locator('[role="button"]:has-text("Text")').first
        if mode_toggle.count() > 0:
            print("[OK] Found Text toggle button")
            mode_toggle.click()
            time.sleep(0.5)
            print("[OK] Clicked Text mode")

            # Now check textarea again
            textarea2 = page.locator('textarea').first
            print(f"[INFO] Textarea still visible: {textarea2.count() > 0}")

            # Check button again
            button_text2 = continue_btn.text_content()
            is_enabled2 = not continue_btn.is_disabled()
            print(f"[INFO] Button text after mode switch: '{button_text2}'")
            print(f"[INFO] Button enabled after mode switch: {is_enabled2}")
        else:
            print("[WARN] Could not find Text mode toggle")

        # STEP 6: Check Auto-Detect
        print("\n[6] Checking Auto-Detect button...")
        auto_btn = page.locator('button:has-text("Auto-Detect from Brief")').first
        if auto_btn.count() > 0:
            auto_enabled = not auto_btn.is_disabled()
            print(f"[INFO] Auto-Detect enabled: {auto_enabled}")

            if auto_enabled:
                print("[OK] Clicking Auto-Detect...")
                auto_btn.click()
                time.sleep(1)
                page.wait_for_load_state('networkidle')
                time.sleep(5)
                print("[OK] Analysis should complete")

                # Check Continue button after analysis
                button_text3 = continue_btn.text_content()
                is_enabled3 = not continue_btn.is_disabled()
                print(f"[INFO] Button text after analysis: '{button_text3}'")
                print(f"[INFO] Button enabled after analysis: {is_enabled3}")
        else:
            print("[WARN] Auto-Detect button not found")

        input("\nPress Enter to close browser...")
        browser.close()

if __name__ == "__main__":
    test_debug3()
