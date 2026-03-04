#!/usr/bin/env python3
"""
Debug test 2: Check textarea value and React state
"""

from playwright.sync_api import sync_playwright
import time
import json

def test_debug2():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()

        print("\n" + "="*70)
        print("DEBUG TEST 2: Check textarea and React state")
        print("="*70)

        # STEP 1: Load
        print("\n[1] Loading app...")
        page.goto('http://localhost:3001', wait_until='networkidle')
        time.sleep(1)
        print("[OK] App loaded")

        # STEP 2: Get initial textarea value
        print("\n[2] Getting initial textarea...")
        textarea = page.locator('textarea').first
        initial_value = textarea.input_value() if textarea.count() > 0 else "NOT FOUND"
        print(f"[INFO] Initial textarea value: '{initial_value}'")

        # STEP 3: Fill textarea
        print("\n[3] Filling textarea...")
        test_text = "Write 100 words on Artificial Intelligence"
        textarea.fill(test_text)
        time.sleep(0.5)
        print(f"[INFO] Filled with: '{test_text}'")

        # STEP 4: Check if textarea value was updated
        print("\n[4] Checking textarea after fill...")
        after_fill_value = textarea.input_value() if textarea.count() > 0 else "NOT FOUND"
        print(f"[INFO] Textarea value after fill: '{after_fill_value}'")
        print(f"[INFO] Match: {after_fill_value == test_text}")

        # STEP 5: Try typing instead of fill
        print("\n[5] Trying clear + type instead...")
        textarea.clear()
        time.sleep(0.2)
        textarea.type(test_text, delay=10)
        time.sleep(0.5)
        typed_value = textarea.input_value()
        print(f"[INFO] After type: '{typed_value}'")
        print(f"[INFO] Match: {typed_value == test_text}")

        # STEP 6: Check button state
        print("\n[6] Checking Continue button...")
        continue_btn = page.locator('button:has-text("Continue")').first
        button_text = continue_btn.text_content()
        is_enabled = not continue_btn.is_disabled()
        print(f"[INFO] Button text: '{button_text}'")
        print(f"[INFO] Button enabled: {is_enabled}")

        # STEP 7: Check if Auto-Detect button is enabled
        print("\n[7] Checking Auto-Detect button...")
        auto_btn = page.locator('button:has-text("Auto-Detect from Brief")').first
        if auto_btn.count() > 0:
            auto_enabled = not auto_btn.is_disabled()
            print(f"[INFO] Auto-Detect enabled: {auto_enabled}")
        else:
            print(f"[WARN] Auto-Detect button not found!")

        # STEP 8: Get page HTML around textarea
        print("\n[8] Checking page structure...")
        content = page.content()
        if "briefMode" in content:
            print("[OK] Found 'briefMode' in page")
        if "hasBriefContent" in content:
            print("[OK] Found 'hasBriefContent' in page")

        # STEP 9: Check all textareas on page
        print("\n[9] Finding all textareas...")
        textareas = page.locator('textarea')
        count = textareas.count()
        print(f"[INFO] Found {count} textareas")
        for i in range(count):
            val = textareas.nth(i).input_value()
            print(f"  [Textarea {i}]: '{val[:50]}...' (length: {len(val)})")

        # STEP 10: Use JavaScript to check React state
        print("\n[10] Checking React state via JavaScript...")
        try:
            result = page.evaluate("""
                () => {
                    // Try to find React's root instance
                    const root = document.querySelector('#root')._reactRootContainer;
                    if (root) {
                        return 'React root found';
                    }
                    return 'React root not found';
                }
            """)
            print(f"[INFO] React check: {result}")
        except Exception as e:
            print(f"[WARN] Could not access React state: {str(e)[:100]}")

        input("\nPress Enter to close browser...")
        browser.close()

if __name__ == "__main__":
    test_debug2()
