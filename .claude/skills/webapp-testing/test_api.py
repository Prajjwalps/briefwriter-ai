#!/usr/bin/env python3
"""
Test API endpoint directly
"""

import requests
import tempfile
import json
import time

def test_api():
    print("\n" + "="*70)
    print("API TEST")
    print("="*70)

    # Create a test brief file
    print("\n[1] Creating test brief file...")
    brief_text = "Write 100 words on Artificial Intelligence"
    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
        f.write(brief_text)
        temp_file = f.name
    print(f"[OK] Created {temp_file}")

    # Call the API
    print("\n[2] Calling /api/analyse...")
    with open(temp_file, 'rb') as f:
        files = {'files': f}
        data = {
            'extraInstructions': '',
        }

        try:
            response = requests.post(
                'http://localhost:3001/api/analyse',
                files=files,
                data=data,
                timeout=30
            )

            print(f"[OK] Response status: {response.status_code}")

            if response.status_code == 200:
                result = response.json()
                print(f"\n[3] Response JSON:")
                print(json.dumps(result, indent=2)[:500])

                # Check for required fields
                required_fields = ['outline', 'keywords', 'subject', 'taskType', 'summary']
                for field in required_fields:
                    if field in result:
                        print(f"[OK] {field}: present")
                    else:
                        print(f"[FAIL] {field}: MISSING")
            else:
                print(f"[ERROR] Response body: {response.text[:500]}")

        except requests.exceptions.Timeout:
            print("[ERROR] Request timeout (30 seconds)")
        except Exception as e:
            print(f"[ERROR] {e}")

    import os
    os.unlink(temp_file)

if __name__ == "__main__":
    # Wait for server
    print("Waiting for server...")
    time.sleep(2)
    test_api()
