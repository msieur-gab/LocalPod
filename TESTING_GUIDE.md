# Pinata Integration Testing Guide

## ⚠️ Security Notice

Your Pinata credentials are now in the conversation history. After testing:
1. **Regenerate your API keys** at https://app.pinata.cloud/keys
2. **Never commit API keys** to git repositories
3. Use the new keys for production use

---

## Quick Test (Standalone)

### Option 1: Simple API Test

1. Open `test-pinata.html` in your browser
2. Click "Test Upload"
3. Wait for CID to appear
4. Click "Test Download"
5. Verify data matches

This tests the provider abstraction works correctly with your Pinata account.

---

## Full Integration Test (Complete Flow)

### Step 1: Configure Storage Provider

1. **Start a local server:**
   ```bash
   python3 -m http.server 8000
   # or
   npx serve .
   ```

2. **Open demo.html:**
   ```
   http://localhost:8000/demo.html
   ```

3. **Create/Login to account:**
   - Create a new account or login to existing one
   - Remember your password (needed for encryption)

4. **Configure Pinata:**
   - Scroll down to "🔑 IPFS Storage Configuration"
   - Select Provider: **Pinata**
   - Paste JWT:
     ```
     eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiI5MzM3YTI4Yi0xYWFhLTQ5MTctYTVjYy04MjUwOTAxOGIwNzciLCJlbWFpbCI6ImJhdWRlLmdhYnJpZWxAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsInBpbl9wb2xpY3kiOnsicmVnaW9ucyI6W3siZGVzaXJlZFJlcGxpY2F0aW9uQ291bnQiOjEsImlkIjoiRlJBMSJ9LHsiZGVzaXJlZFJlcGxpY2F0aW9uQ291bnQiOjEsImlkIjoiTllDMSJ9XSwidmVyc2lvbiI6MX0sIm1mYV9lbmFibGVkIjpmYWxzZSwic3RhdHVzIjoiQUNUSVZFIn0sImF1dGhlbnRpY2F0aW9uVHlwZSI6InNjb3BlZEtleSIsInNjb3BlZEtleUtleSI6IjQxYzJkNDMxNzZkODNmOTk1YTc4Iiwic2NvcGVkS2V5U2VjcmV0IjoiZmVkMTYwY2RmZDJhYzJhZjkwMjJjYjZjNWQzN2NiOTA3N2RiNzQyZTk1NmJiNWZiYmNlNWRlODk3MmJhOWE0MyIsImV4cCI6MTc5Mjg3NjA4NH0.yjGTIAeu7db1AlUOL8q1wc94iAf9C2tPYLKS1XhF92A
     ```
   - Leave Gateway URL empty (uses default)
   - Click **Save Configuration**
   - Look for green success message

### Step 2: Test Simple Service

1. **Open simple-service.html:**
   ```
   http://localhost:8000/simple-service.html
   ```

2. **Connect with LocalPod:**
   - Click "Connect with LocalPod" button
   - Grant authorization window opens (demo.html)

3. **Approve Grant:**
   - Review the permissions request
   - Click "Approve" button
   - You'll be redirected back to simple-service.html

4. **Create a Post:**
   - Enter Title: "Test Post"
   - Enter Content: "Testing Pinata IPFS integration"
   - Click "Save to IPFS"
   - Wait for success message

5. **Verify Upload:**
   - Open Browser DevTools (F12)
   - Check Console for:
     ```
     ✅ Uploaded to Pinata, CID: bafk...
     ✅ Saved to IPFS - CID: bafk...
     ```
   - Note the CID

6. **Test Persistence:**
   - Refresh the page (F5)
   - Post should load automatically from IPFS
   - Check Console for:
     ```
     ✅ Storage provider restored: pinata
     📥 Loading data from IPFS via provider: bafk...
     ✅ Loaded 1 items from IPFS
     ```

7. **Verify on Pinata Dashboard:**
   - Go to https://app.pinata.cloud/pinmanager
   - You should see your uploaded file
   - CID should match what you saw in console

---

## Expected Console Output

### On Grant Approval (grant.html)
```
✅ UCAN token generated
📦 Decrypting storage configuration
✅ Storage provider configured: pinata
✅ Grant saved to IndexedDB
🎉 UCAN grant complete! Returning to service...
```

### On Simple Service Load (simple-service.html)
```
✅ Grant approved!
  ucan: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9..."
  expiresAt: "2025-10-31T..."
  provider: "pinata"
✅ Storage provider initialized: pinata
```

### On Post Save
```
📤 Saving to IPFS...
✅ Uploaded to Pinata, CID: bafkreiabcd1234...
✅ Saved to IPFS - CID: bafkreiabcd1234...
```

### On Page Reload
```
🔍 DEBUG - localStorage raw: "{...}"
🔍 DEBUG - Parsed grant: {...}
✅ Storage provider restored: pinata
🔍 DEBUG - State after restore:
  hasUcan: true
  hasProvider: true
  userPublicKey: "z6Mkp..."
  ipfsCid: "bafkreiabcd1234..."
📥 Loading data from IPFS via provider: bafkreiabcd1234...
✅ Loaded 1 items from IPFS
```

---

## Troubleshooting

### Error: "Pinata upload failed (401)"
- **Cause:** Invalid or expired JWT
- **Fix:** Check JWT is copied correctly, regenerate if needed

### Error: "Pinata upload failed (403)"
- **Cause:** API key doesn't have upload permissions
- **Fix:** Recreate API key with "pinFileToIPFS" permission

### Error: "No storage provider configured"
- **Cause:** Storage config not saved in demo.html
- **Fix:** Go back to demo.html and configure Pinata

### Error: "Failed to load storage config"
- **Cause:** Browser IndexedDB issues
- **Fix:** Clear site data, reconfigure from scratch

### Posts don't persist after refresh
- **Cause:** CID not saved to localStorage
- **Fix:** Check Console for errors during save

---

## Verification Checklist

- [ ] Pinata configuration saves successfully in demo.html
- [ ] Console shows "Storage provider initialized: pinata"
- [ ] Post saves and returns a CID
- [ ] CID appears in Pinata dashboard
- [ ] Posts load after page refresh
- [ ] Multiple posts can be created
- [ ] No presigned URL expiration errors
- [ ] No AWS/S3 references in console

---

## What Changed (Summary)

### Removed
- ❌ AWS Signature V4 code (801 lines)
- ❌ Presigned URL generation
- ❌ 1-hour expiration limitations
- ❌ Presigned URL renewal flow
- ❌ S3-specific upload/download logic

### Added
- ✅ Provider abstraction layer (ipfs-providers.js)
- ✅ PinataProvider implementation
- ✅ Encrypted JWT storage in IndexedDB
- ✅ Provider configuration UI in demo.html
- ✅ Direct IPFS API uploads
- ✅ Portable CID-based downloads

### Benefits
- 🔐 User brings their own IPFS provider (sovereignty)
- 🌍 Ready for European providers (Scaleway, 4everland)
- ♾️ No expiration - JWT doesn't expire hourly
- 🔄 Portable - CIDs work on any gateway
- 🧹 Simpler - no complex AWS signing logic

---

## Next Steps After Testing

1. **Regenerate Pinata Keys** (important!)
2. **Test with multiple posts**
3. **Test edit/delete functionality** (if implemented)
4. **Test across different browsers**
5. **Test on mobile PWA** (if deploying as PWA)

---

## Files Created/Modified

### New Files
- `ipfs-providers.js` - Provider abstraction
- `PINATA_MIGRATION.md` - Migration guide
- `test-pinata.html` - Standalone test
- `TESTING_GUIDE.md` - This file

### Modified Files
- `storage.js` - Added storageConfig table, removed 801 lines of S3 code
- `demo.html` - Added provider config UI
- `demo.js` - Added encryption/storage logic
- `grant.html` - Decrypt and pass provider config
- `simple-service.html` - Use provider.upload()/download()

### Deprecated Files
- `renew-presigned-url.html` - No longer needed
- `netlify/functions/presigned-url.js` - Not needed for Pinata

---

**Ready to test! 🚀**
