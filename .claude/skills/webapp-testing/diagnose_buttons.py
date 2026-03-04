from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    print("Loading application...")
    page.goto('http://localhost:3001', wait_until='networkidle')
    time.sleep(1)

    print("\n=== SCREEN 1 BUTTONS ===")
    buttons = page.locator('button')
    print(f"Total buttons found: {buttons.count()}")
    for i, button in enumerate(buttons.all()[:10]):
        text = button.text_content().strip()
        # Remove non-ASCII characters to avoid encoding issues
        text_ascii = ''.join(c for c in text if ord(c) < 128)
        print(f"  [{i}] {text_ascii[:60]}")

    print("\n=== TEXT INPUTS ===")
    textareas = page.locator('textarea')
    print(f"Total textareas: {textareas.count()}")
    for i, ta in enumerate(textareas.all()[:5]):
        placeholder = ta.get_attribute('placeholder') or ""
        print(f"  [{i}] placeholder: {placeholder[:60]}")

    print("\n=== INPUT FIELDS ===")
    inputs = page.locator('input')
    print(f"Total inputs: {inputs.count()}")

    print("\n=== SEARCHING FOR COMMON BUTTON TEXTS ===")
    for text in ["Start", "Analyze", "Search", "Continue", "Next", "Begin"]:
        btn = page.locator(f'button:has-text("{text}")')
        if btn.count() > 0:
            print(f"  Found button with text '{text}': {btn.count()}")
        else:
            print(f"  NOT found: '{text}'")

    browser.close()
    print("\nDone.")
