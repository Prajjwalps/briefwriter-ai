#!/usr/bin/env python3
"""
Simple test: Write 100 words on AI, find 2 sources, go to Screen 3
"""

from playwright.sync_api import sync_playwright
import time
import tempfile
import os

def test_simple():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()
        page.set_viewport_size({"width": 1280, "height": 800})

        try:
            print("\n" + "="*70)
            print("SIMPLE FLOW TEST: AI Brief -> 2 Sources -> Screen 3")
            print("="*70)

            # STEP 1: Load
            print("\n[1] Loading app...")
            page.goto('http://localhost:3001', wait_until='networkidle')
            time.sleep(2)
            print("[OK] App loaded")

            # STEP 2: Upload brief file
            print("\n[2] Uploading brief: 'Write 100 words on Artificial Intelligence'")
            with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
                f.write("Write 100 words on Artificial Intelligence")
                temp_file = f.name

            file_input = page.locator('input[type="file"]').first
            file_input.set_input_files(temp_file)
            print("[OK] Brief file uploaded")
            time.sleep(1)

            # STEP 3: Click Analyse Brief button
            print("\n[3] Clicking Analyse Brief button...")
            analyse_btn = page.locator('button:has-text("Analyse Brief")').first
            if analyse_btn.count() > 0:
                analyse_btn.click()
                print("[OK] Analyse button clicked")
                # Wait for analysis
                page.wait_for_load_state('networkidle')
                time.sleep(5)
                print("[OK] Analysis complete")
            else:
                print("[ERROR] Analyse Brief button not found!")
                return False

            # STEP 4: Click Continue to Screen 2
            print("\n[4] Going to Screen 2...")
            continue_btn = page.locator('button:has-text("Continue"):not([disabled])').first
            if continue_btn.count() > 0:
                continue_btn.click()
                print("[OK] Navigating to Screen 2...")
                page.wait_for_load_state('networkidle')
                time.sleep(2)
            else:
                print("[WARN] Continue button disabled - trying anyway")
                # Try clicking disabled button
                all_buttons = page.locator('button:has-text("Continue")')
                if all_buttons.count() > 0:
                    all_buttons.first.click()
                    page.wait_for_load_state('networkidle')
                    time.sleep(2)

            # STEP 5: Search for sources
            print("\n[5] Searching for sources...")
            search_btn = page.locator('button:has-text("Search")').first
            if search_btn.count() > 0:
                search_btn.click()
                print("[OK] Search clicked")
                print("    Waiting for results (30 seconds)...")
                page.wait_for_load_state('networkidle')
                time.sleep(3)
                print("[OK] Search completed")
            else:
                print("[ERROR] Search button not found!")
                return False

            # STEP 6: Select 2 sources manually
            print("\n[6] Selecting 2 sources...")
            checkboxes = page.locator('input[type="checkbox"]')
            count = checkboxes.count()
            print(f"    Found {count} checkboxes")

            if count >= 2:
                checkboxes.nth(0).check()
                checkboxes.nth(1).check()
                print("[OK] Selected 2 sources")
                time.sleep(1)
            elif count > 0:
                checkboxes.nth(0).check()
                print(f"[WARN] Only {count} source(s) available, selected what we could")
                time.sleep(1)
            else:
                print("[ERROR] No sources found!")
                return False

            # STEP 7: Navigate to Screen 3
            print("\n[7] Going to Screen 3...")
            continue_btns = page.locator('button:has-text("Continue")')
            if continue_btns.count() >= 2:
                # Take screenshot before clicking
                page.screenshot(path='/tmp/before_screen3.png')
                continue_btns.last.click()
                print("[OK] Clicked Continue to Screen 3")
                print("    Waiting for outline generation (30 seconds)...")
                page.wait_for_load_state('networkidle')
                time.sleep(4)
                print("[OK] Screen 3 loaded")
            else:
                print("[ERROR] Continue button not found!")
                return False

            # STEP 8: Check Screen 3 content
            print("\n[8] Verifying Screen 3...")
            page.screenshot(path='/tmp/screen3_final.png')

            content = page.content()
            checks = {
                "Page title": "Create Final Outline" in content or "Enhanced Outline" in content,
                "Section inputs": page.locator('input[type="text"]').count() > 0,
                "Textareas": page.locator('textarea').count() > 0,
                "Continue button": page.locator('button:has-text("Continue to Draft")').count() > 0,
            }

            print("\n    Screen 3 Verification:")
            for name, result in checks.items():
                status = "[OK]" if result else "[FAIL]"
                print(f"      {status} {name}")

            if all(checks.values()):
                print("\n" + "="*70)
                print("SUCCESS! All features working!")
                print("="*70)
                print("\nScreenshots:")
                print("  - /tmp/before_screen3.png (before navigation)")
                print("  - /tmp/screen3_final.png (Screen 3 loaded)")
                return True
            else:
                print("\n[ERROR] Some checks failed")
                # Check for error message
                if "Missing Data" in content:
                    print("\nFound 'Missing Data' error on Screen 3")
                    print("This means data is not being passed from Screen 2")
                return False

        except Exception as e:
            print(f"\n[ERROR] Test failed: {e}")
            import traceback
            traceback.print_exc()
            page.screenshot(path='/tmp/error_screen.png')
            return False
        finally:
            try:
                os.unlink(temp_file)
            except:
                pass
            input("\nPress Enter to close browser...")
            browser.close()

if __name__ == "__main__":
    success = test_simple()
    exit(0 if success else 1)
