#!/usr/bin/env python3
"""
Debug test: Check brief content detection
"""

from playwright.sync_api import sync_playwright
import time

def test_debug():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()

        print("\n" + "="*70)
        print("DEBUG TEST: Brief Content Detection")
        print("="*70)

        # STEP 1: Load
        print("\n[1] Loading app...")
        page.goto('http://localhost:3001', wait_until='networkidle')
        time.sleep(1)
        print("[OK] App loaded")

        # STEP 2: Enter brief
        print("\n[2] Entering brief text...")
        textarea = page.locator('textarea').first
        textarea.fill("Write 100 words on Artificial Intelligence")
        time.sleep(0.5)
        print("[OK] Brief entered")

        # STEP 3: Check button state BEFORE analysis
        print("\n[3] Checking button state BEFORE Auto-Detect...")
        button = page.locator('button:has-text("Auto-Detect from Brief")').first
        if button.count() > 0:
            is_enabled = not button.is_disabled()
            print(f"[INFO] Auto-Detect button exists: {button.count()}")
            print(f"[INFO] Auto-Detect button enabled: {is_enabled}")
        else:
            print("[WARN] Auto-Detect button not found!")

        continue_btn = page.locator('button:has-text("Continue")').first
        if continue_btn.count() > 0:
            is_enabled = not continue_btn.is_disabled()
            button_text = continue_btn.text_content()
            print(f"[INFO] Continue button text: '{button_text}'")
            print(f"[INFO] Continue button enabled: {is_enabled}")

        # STEP 4: Take screenshot before analysis
        page.screenshot(path='/tmp/debug_before_analysis.png')
        print("[OK] Screenshot: /tmp/debug_before_analysis.png")

        # STEP 5: Click Auto-Detect
        print("\n[4] Clicking Auto-Detect...")
        button = page.locator('button:has-text("Auto-Detect from Brief")').first
        button.click()
        print("[OK] Auto-Detect clicked")

        # STEP 6: Wait for analysis
        print("\n[5] Waiting for analysis (10 seconds)...")
        page.wait_for_load_state('networkidle')
        time.sleep(6)
        print("[OK] Waited")

        # STEP 7: Check button state AFTER analysis
        print("\n[6] Checking button state AFTER analysis...")
        continue_btn = page.locator('button:has-text("Continue")').first
        if continue_btn.count() > 0:
            is_enabled = not continue_btn.is_disabled()
            button_text = continue_btn.text_content()
            print(f"[INFO] Continue button text: '{button_text}'")
            print(f"[INFO] Continue button enabled: {is_enabled}")
            print(f"[INFO] Continue button disabled attr: {continue_btn.is_disabled()}")

        # STEP 8: Check page content
        print("\n[7] Checking page content...")
        content = page.content()
        if "Context Analysis Complete" in content:
            print("[OK] Found 'Context Analysis Complete' in page")
        else:
            print("[WARN] 'Context Analysis Complete' NOT found in page")

        if "analysisComplete" in content:
            print("[OK] Found 'analysisComplete' in page")
        else:
            print("[WARN] 'analysisComplete' NOT found in page")

        # STEP 9: Check browser console for errors
        print("\n[8] Checking browser console...")
        # Check for any errors by looking at the page
        page.screenshot(path='/tmp/debug_after_analysis.png')
        print("[OK] Screenshot: /tmp/debug_after_analysis.png")

        input("\nPress Enter to close browser...")
        browser.close()

if __name__ == "__main__":
    test_debug()
