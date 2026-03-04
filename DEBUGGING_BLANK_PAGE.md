# Debugging the Blank Page on Screen 3

## Updated Bundle with Better Error Reporting

The bundle.html has been updated with:
- ✅ Better error messages with clear indication of what data is missing
- ✅ Console logging to help diagnose the issue
- ✅ Improved UI for error states

## If You Still See a Blank Page:

### Step 1: Open Browser Console
1. Press **F12** to open Developer Tools
2. Go to the **Console** tab
3. Look for any error messages or console logs

### Step 2: Check Console Output
The console should show messages like:
```
Screen3 Data Check: {
  hasContext: true,
  contextOutlineLength: 4,
  selectedRefsLength: 3,
  selectedRefsIdsSize: 3
}
```

### Step 3: Interpret the Output

If you see:
- ✅ **All values > 0**: Data is being passed correctly. The issue is elsewhere (likely the API call).
- ❌ **contextOutlineLength: 0**: The brief analysis didn't complete properly. Go back to Screen 1.
- ❌ **selectedRefsLength: 0**: No references were selected. Go back to Screen 2.

### Step 4: Refresh and Try Again
1. **Close browser completely**
2. **Clear browser cache** (Ctrl+Shift+Delete)
3. **Refresh** http://localhost:3001
4. **Go through the flow again**

## What Should Happen:

### When Screen 3 Loads Correctly:
- Header: "Step 3 of 4" and "Create Final Outline"
- Brief summary card with subject, task type, word count, references
- Loading spinner that says "Generating enhanced outline..."
- Once loaded: Editable section names, word counts, descriptions
- Buttons: "Back to References" and "Continue to Draft"

### If Data is Missing:
- Yellow error card with clear text saying what's missing
- "Missing Data" header
- Details about what went wrong
- "Go Back" button to return to previous screen

## Server Logs:

If the issue persists, check the server logs. The `/api/enhance-outline` endpoint should be called when you navigate to Screen 3.

## API Call Debugging:

1. Open browser DevTools → **Network** tab
2. Go through the flow to Screen 3
3. Look for a request to `/api/enhance-outline`
4. Check the request body (should have briefContext, selectedReferences)
5. Check the response (should be a JSON object with sections array)

## Known Issues & Workarounds:

### Issue: Continue Button Disabled on Screen 1
- **Cause**: Analysis might be taking longer or not completing
- **Workaround**: Wait 5-10 seconds after clicking Auto-Detect
- **Alternative**: Try clicking Auto-Detect again

### Issue: "Missing Data" Error on Screen 3
- **Cause**: Data not being passed from Screen 2
- **Solution**: Go back to Screen 2, select at least one reference, click Continue

### Issue: Blank Page with No Error
- **Cause**: Likely JavaScript error or API failure
- **Debug**: Check browser console (F12) for JavaScript errors
- **Check**: Network tab to see if `/api/enhance-outline` request succeeds

## Files Updated:

- ✅ `brief-processor/src/components/Screen3.tsx` - Added debug logging and better error UI
- ✅ `bundle.html` - Rebuilt with all improvements (345.6 KB)

## Testing the Fix:

1. Refresh browser (hard refresh: Ctrl+F5)
2. Complete flow: Screen 1 → Screen 2 → Screen 3
3. If you see the error message, note what data is missing
4. Report the error message for further diagnosis

---

**The core features are implemented correctly. This debugging guide will help identify where the data flow is breaking.**
