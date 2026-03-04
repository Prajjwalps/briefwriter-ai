from playwright.sync_api import sync_playwright
import time

def test_app():
    """End-to-end test of BriefWriter AI with new features"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)  # Show UI for inspection
        page = browser.new_page()

        print("=== STEP 1: Navigate to app ===")
        page.goto('http://localhost:3001', wait_until='networkidle')
        time.sleep(1)

        # Take initial screenshot
        page.screenshot(path='/tmp/step1_initial.png', full_page=True)
        print("✓ Application loaded")

        # Get page content for inspection
        content = page.content()
        if "Upload Your Brief" in content:
            print("✓ Screen 1 (Upload Brief) detected")
        else:
            print("✗ Screen 1 not found")
            print(f"Page title: {page.title()}")

        print("\n=== STEP 2: Fill in brief text ===")
        # Find the brief text input
        brief_input = page.locator('textarea[placeholder*="Brief content"]').first
        if brief_input.count() > 0:
            brief_input.fill("Write an essay about climate change and its effects on global economies. 2000 words required.")
            print("✓ Brief text entered")
        else:
            print("! No brief textarea found, checking alternatives...")
            textareas = page.locator('textarea')
            if textareas.count() > 0:
                print(f"  Found {textareas.count()} textarea(s)")
                # Use first textarea if available
                textareas.first.fill("Write an essay about climate change and its effects on global economies. 2000 words required.")
                print("✓ Brief text entered in first textarea")

        page.screenshot(path='/tmp/step2_brief_filled.png', full_page=True)

        print("\n=== STEP 3: Click START button ===")
        start_button = page.locator('button:has-text("Start")').first
        if start_button.count() > 0:
            start_button.click()
            print("✓ START button clicked")
            # Wait for analysis to complete
            page.wait_for_load_state('networkidle')
            time.sleep(2)
            page.screenshot(path='/tmp/step3_analysis_complete.png', full_page=True)
        else:
            print("! START button not found")
            buttons = page.locator('button').all()
            print(f"  Available buttons: {[b.text_content() for b in buttons[:5]]}")

        print("\n=== STEP 4: Navigate to Screen 2 (Find References) ===")
        continue_btn = page.locator('button:has-text("Continue")').first
        if continue_btn.count() > 0:
            continue_btn.click()
            print("✓ Continue to Screen 2 clicked")
            page.wait_for_load_state('networkidle')
            time.sleep(1)
            page.screenshot(path='/tmp/step4_screen2_loaded.png', full_page=True)
        else:
            print("! Continue button not found")

        # Check if on Screen 2
        content = page.content()
        if "Find References" in content or "Academic" in content:
            print("✓ Screen 2 (Find References) loaded")

            print("\n=== STEP 5: Test Select All Academic button ===")
            select_all_academic = page.locator('button:has-text("Select All Academic")').first
            if select_all_academic.count() > 0:
                select_all_academic.click()
                print("✓ Select All Academic button found and clicked")
                page.screenshot(path='/tmp/step5_academic_selected.png', full_page=True)
                time.sleep(0.5)
            else:
                print("! Select All Academic button not found")
                buttons = page.locator('button').all()
                print(f"  Total buttons on page: {len(buttons)}")

            print("\n=== STEP 6: Test Select All Non-Academic button ===")
            select_all_nonademic = page.locator('button:has-text("Select All Non-Academic")').first
            if select_all_nonademic.count() > 0:
                select_all_nonademic.click()
                print("✓ Select All Non-Academic button found and clicked")
                page.screenshot(path='/tmp/step6_nonademic_selected.png', full_page=True)
                time.sleep(0.5)
            else:
                print("! Select All Non-Academic button not found")

            print("\n=== STEP 7: Click Search to find references ===")
            search_btn = page.locator('button:has-text("Search References")').first
            if search_btn.count() > 0:
                search_btn.click()
                print("✓ Search References button clicked")
                print("  Waiting for search results...")
                page.wait_for_load_state('networkidle')
                time.sleep(3)
                page.screenshot(path='/tmp/step7_search_results.png', full_page=True)
            else:
                print("! Search References button not found")

            print("\n=== STEP 8: Test Select All References button ===")
            select_all_refs = page.locator('button:has-text("Select All References")').first
            if select_all_refs.count() > 0:
                select_all_refs.click()
                print("✓ Select All References button found and clicked")
                page.screenshot(path='/tmp/step8_all_refs_selected.png', full_page=True)
                time.sleep(0.5)
            else:
                print("! Select All References button not found")

            print("\n=== STEP 9: Navigate to Screen 3 ===")
            continue_to_screen3 = page.locator('button:has-text("Continue to Outline")').first
            if continue_to_screen3.count() == 0:
                # Try alternative button text
                continue_to_screen3 = page.locator('button:has-text("Continue")').last

            if continue_to_screen3.count() > 0:
                continue_to_screen3.click()
                print("✓ Continue to Screen 3 clicked")
                print("  Waiting for enhanced outline generation...")
                page.wait_for_load_state('networkidle')
                time.sleep(3)
                page.screenshot(path='/tmp/step9_screen3_loaded.png', full_page=True)

                # Check if on Screen 3
                content = page.content()
                if "Enhanced Outline" in content or "Create Final Outline" in content:
                    print("✓ Screen 3 (Enhanced Outline) loaded")

                    print("\n=== STEP 10: Test editable outline ===")
                    # Try to find and edit a section name
                    section_inputs = page.locator('input[type="text"]').all()
                    print(f"  Found {len(section_inputs)} text inputs")
                    if len(section_inputs) > 0:
                        # Edit first section name
                        section_inputs[0].clear()
                        section_inputs[0].fill("Updated Section Name")
                        print("✓ Section name edited")
                        page.screenshot(path='/tmp/step10_section_edited.png', full_page=True)

                    print("\n=== STEP 11: Test regenerate outline ===")
                    regenerate_btn = page.locator('button:has-text("Regenerate")').first
                    if regenerate_btn.count() > 0:
                        print("✓ Regenerate button found")
                        # Fill in extra instructions
                        textarea = page.locator('textarea').first
                        if textarea.count() > 0:
                            textarea.fill("Add more focus on economic impacts")
                            print("✓ Extra instructions entered")
                        page.screenshot(path='/tmp/step11_regenerate_ready.png', full_page=True)
                    else:
                        print("! Regenerate button not found")

                    print("\n=== STEP 12: Continue to Screen 4 ===")
                    continue_to_screen4 = page.locator('button:has-text("Continue to Draft")').first
                    if continue_to_screen4.count() > 0:
                        continue_to_screen4.click()
                        print("✓ Continue to Screen 4 clicked")
                        page.wait_for_load_state('networkidle')
                        time.sleep(1)
                        page.screenshot(path='/tmp/step12_screen4.png', full_page=True)
                    else:
                        print("! Continue to Draft button not found")
                else:
                    print("✗ Screen 3 not detected")
                    print(f"Page content length: {len(content)}")
            else:
                print("! Continue button not found on Screen 2")
        else:
            print("✗ Screen 2 not detected")

        print("\n=== TEST COMPLETE ===")
        print("Screenshots saved to /tmp/step*.png")

        # Keep browser open for manual inspection if needed
        input("Press Enter to close browser...")
        browser.close()

if __name__ == "__main__":
    test_app()
