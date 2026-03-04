from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    print("Loading application...")
    page.goto('http://localhost:3001', wait_until='networkidle')
    time.sleep(1)

    print("\n=== FORM FIELD ANALYSIS ===")

    print("\nTextareas:")
    textareas = page.locator('textarea')
    for i, ta in enumerate(textareas.all()):
        placeholder = ta.get_attribute('placeholder') or ""
        name = ta.get_attribute('name') or ""
        required = ta.get_attribute('required')
        print(f"  [{i}] placeholder: {placeholder[:80]}")
        print(f"        name: {name}, required: {required}")

    print("\nInput fields:")
    inputs = page.locator('input')
    for i, inp in enumerate(inputs.all()):
        inp_type = inp.get_attribute('type') or "text"
        name = inp.get_attribute('name') or ""
        placeholder = inp.get_attribute('placeholder') or ""
        required = inp.get_attribute('required')
        value = inp.get_attribute('value') or ""
        print(f"  [{i}] type: {inp_type}, name: {name}")
        print(f"        placeholder: {placeholder[:60]}")
        print(f"        value: {value[:40]}, required: {required}")

    print("\nSelects/Dropdowns:")
    selects = page.locator('select')
    print(f"  Total: {selects.count()}")

    print("\nDisabled button status:")
    buttons = page.locator('button')
    for i, btn in enumerate(buttons.all()):
        text = ''.join(c for c in btn.text_content() if ord(c) < 128).strip()[:50]
        disabled = btn.get_attribute('disabled')
        print(f"  [{i}] '{text}' - disabled: {disabled}")

    browser.close()
