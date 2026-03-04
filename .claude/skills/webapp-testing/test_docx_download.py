#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test DOCX download functionality on Screen 4
"""

from playwright.sync_api import sync_playwright
import time
import os

def test_docx_download():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()

        print("[1] Loading app...")
        page.goto('http://localhost:3001', wait_until='networkidle')
        time.sleep(1)

        # Upload test brief
        print("[2] Uploading test brief...")
        brief_path = r'D:\Claude Code\Project 1\test-brief.txt'
        file_input = page.locator('input[type="file"]').first
        file_input.set_input_files(brief_path)
        time.sleep(1)

        # Click Analyse Brief
        print("[3] Clicking Analyse Brief...")
        analyse_btn = page.locator('button:has-text("Analyse Brief")').first
        if analyse_btn.count() > 0:
            analyse_btn.click()
            print("   Button clicked")
        time.sleep(8)

        # Continue to Screen 2
        print("[4] Continuing to Screen 2...")
        continue_btn = page.locator('button:has-text("Continue")').first
        if continue_btn.count() > 0 and not continue_btn.is_disabled():
            continue_btn.click()
            time.sleep(2)
            print("   Navigated to Screen 2")
        else:
            print("   Continue button not available")

        # Quick reference selection - select first 3 results
        print("[5] Selecting references...")
        refs = page.locator('input[type="checkbox"][name^="ref-"]')
        count = refs.count()
        for i in range(min(3, count)):
            refs.nth(i).check()
        time.sleep(1)
        print(f"   Selected {min(3, count)} references")

        # Continue to Screen 3
        print("[6] Continuing to Screen 3...")
        continue_btn = page.locator('button:has-text("Continue")').first
        if continue_btn.count() > 0:
            continue_btn.click()
            time.sleep(6)
            print("   Navigated to Screen 3")

        # Continue to Screen 4
        print("[7] Continuing to Screen 4...")
        continue_btn = page.locator('button:has-text("Continue to Draft")').first
        if continue_btn.count() > 0:
            continue_btn.click()
            time.sleep(2)
            print("   Navigated to Screen 4")

        # Generate document
        print("[8] Generating document...")
        gen_btn = page.locator('button:has-text("Generate Full Document")').first
        if gen_btn.count() > 0:
            gen_btn.click()
            time.sleep(6)
            print("   Document generation started")

        # Test DOCX download
        print("[9] Testing DOCX download...")
        
        # Listen for download
        with page.expect_download() as download_info:
            download_btn = page.locator('button:has-text("Download as DOCX")').first
            if download_btn.count() > 0:
                download_btn.click()
                download = download_info.value
                path = download.path()
                size = os.path.getsize(path)
                print(f"   DOCX downloaded: {download.suggested_filename}")
                print(f"   File size: {size} bytes")
                
                # Verify it's a valid DOCX (ZIP format)
                with open(path, 'rb') as f:
                    magic = f.read(4)
                    is_zip = magic == b'PK\x03\x04'
                    print(f"   Valid DOCX format (ZIP): {is_zip}")
            else:
                print("   Download button not found")

        print("\n[COMPLETE] Test finished")
        input("Press Enter to close browser...")
        browser.close()

if __name__ == "__main__":
    test_docx_download()
