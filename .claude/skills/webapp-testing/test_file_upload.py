#!/usr/bin/env python3
"""
Test with file upload instead of textarea fill
"""

from playwright.sync_api import sync_playwright
import time
import tempfile
import os

def test_file_upload():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()

        print("\n" + "="*70)
        print("FILE UPLOAD TEST")
        print("="*70)

        # STEP 1: Load
        print("\n[1] Loading app...")
        page.goto('http://localhost:3001', wait_until='networkidle')
        time.sleep(1)
        print("[OK] App loaded")

        # STEP 2: Create a temporary brief file
        print("\n[2] Creating temporary brief file...")
        brief_text = "Write 100 words on Artificial Intelligence"
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
            f.write(brief_text)
            temp_file = f.name
        print(f"[OK] Created {temp_file}")

        # STEP 3: Upload the file
        print("\n[3] Uploading brief file...")
        file_input = page.locator('input[type="file"]').first
        if file_input.count() > 0:
            file_input.set_input_files(temp_file)
            time.sleep(1)
            print(f"[OK] File uploaded")
        else:
            print("[ERROR] File input not found")
            os.unlink(temp_file)
            browser.close()
            return

        # STEP 4: Check Continue button
        print("\n[4] Checking Continue button...")
        continue_btn = page.locator('button:has-text("Continue")').first
        button_text = continue_btn.text_content()
        is_enabled = not continue_btn.is_disabled()
        print(f"[INFO] Button text: '{button_text}'")
        print(f"[INFO] Button enabled: {is_enabled}")

        # STEP 5: Check Auto-Detect button
        print("\n[5] Checking Auto-Detect button...")
        auto_btn = page.locator('button:has-text("Auto-Detect from Brief")').first
        if auto_btn.count() > 0:
            auto_enabled = not auto_btn.is_disabled()
            print(f"[INFO] Auto-Detect enabled: {auto_enabled}")

            if auto_enabled:
                print("\n[6] Clicking Auto-Detect...")
                auto_btn.click()
                time.sleep(1)
                print("[OK] Auto-Detect clicked")

                page.wait_for_load_state('networkidle')
                time.sleep(5)
                print("[OK] Analysis complete")

                # Check Continue button after analysis
                button_text2 = continue_btn.text_content()
                is_enabled2 = not continue_btn.is_disabled()
                print(f"\n[7] After analysis:")
                print(f"[INFO] Button text: '{button_text2}'")
                print(f"[INFO] Button enabled: {is_enabled2}")

                if is_enabled2:
                    print("\n[SUCCESS] Continue button is ENABLED!")
                    print("[OK] Fix is working!")
                else:
                    print("\n[FAIL] Continue button still disabled")
        else:
            print("[ERROR] Auto-Detect button not found")

        # Cleanup
        os.unlink(temp_file)

        input("\nPress Enter...")
        browser.close()

if __name__ == "__main__":
    test_file_upload()
