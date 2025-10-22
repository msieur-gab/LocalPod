# GitHub Pages Deployment Guide

This guide explains how to deploy the LocalPod SDK demo applications to GitHub Pages.

---

## Quick Start

### Option 1: Enable GitHub Pages (Easiest)

1. Go to your GitHub repository settings
2. Navigate to **Pages** section
3. Under "Source", select **Deploy from a branch**
4. Choose **main** branch and **/ (root)** folder
5. Click **Save**
6. Wait 1-2 minutes for deployment
7. Visit: `https://yourusername.github.io/LocalPod/`

### Option 2: Using gh-pages Branch

1. Create a new branch called `gh-pages`
2. Push your code to that branch
3. GitHub will automatically deploy from `gh-pages`

---

## Available Demos

Once deployed, you'll have access to two demo applications:

### 1. Main Application (Collaborative Writer)
**URL**: `https://yourusername.github.io/LocalPod/`
**File**: `index.html`

Features:
- Full collaborative document editing
- Lit-based web components
- Real-time encryption
- Profile management

### 2. SDK Demo (Account Management)
**URL**: `https://yourusername.github.io/LocalPod/demo.html`
**File**: `demo.html`

Features:
- Account creation and management
- Collaborator management
- Profile editor
- Identity QR codes
- Simpler interface for testing SDK features

---

## Configuration

### Local-Only Mode (Default)

The demo works **out of the box** in local-only mode:
- ✅ All data stored in browser IndexedDB
- ✅ No external services required
- ✅ Perfect for testing and development
- ❌ No profile synchronization between devices
- ❌ No remote backup

### Remote Storage Mode (Optional)

To enable remote profile synchronization with Filebase:

1. **Sign up for Filebase**
   - Visit https://filebase.com
   - Create a free account
   - Create a new bucket

2. **Generate API Credentials**
   - Go to Filebase dashboard
   - Navigate to "Access Keys"
   - Generate new access key

3. **Update Configuration**
   - Edit `config.js` (NOT `config.example.js`)
   - Replace empty strings with your credentials:

   ```javascript
   export const config = {
     filebase: {
       accessKey: 'YOUR_ACCESS_KEY_HERE',
       secretKey: 'YOUR_SECRET_KEY_HERE',
       bucket: 'your-bucket-name',
       region: 'us-east-1',
     },
   };
   ```

4. **Important**: If deploying to GitHub Pages with credentials:
   - Add `config.js` to `.gitignore`
   - Never commit real credentials to public repos
   - Consider using environment variables or GitHub Secrets

---

## How It Works

### Import Maps

The demos use **ES Module Import Maps** to resolve dependencies:

```html
<script type="importmap">
{
  "imports": {
    "@localPod/identity-platform": "./sdk/index.js",
    "dexie": "https://cdn.jsdelivr.net/npm/dexie@3.2.3/+esm",
    "@noble/secp256k1": "https://cdn.jsdelivr.net/npm/@noble/secp256k1@2.1.0/+esm",
    "@scure/base": "https://cdn.jsdelivr.net/npm/@scure/base@1.1.1/+esm",
    "qrcode": "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/+esm"
  }
}
</script>
```

- ✅ **Local SDK**: Loaded from `./sdk/index.js`
- ✅ **External Dependencies**: Loaded from CDN (jsDelivr)
- ✅ **No Build Step Required**: Works directly in browser

### .nojekyll File

The `.nojekyll` file tells GitHub Pages to:
- ✅ Serve files starting with `_` (underscore)
- ✅ Not process files through Jekyll
- ✅ Serve raw HTML/JS/CSS files directly

---

## Browser Requirements

The demo requires a modern browser with support for:

- ✅ **ES Modules** (all modern browsers)
- ✅ **Import Maps** (Chrome 89+, Firefox 108+, Safari 16.4+)
- ✅ **Web Crypto API** (all modern browsers)
- ✅ **IndexedDB** (all modern browsers)

### Supported Browsers

| Browser | Minimum Version | Status |
|---------|----------------|--------|
| Chrome/Edge | 89+ | ✅ Fully Supported |
| Firefox | 108+ | ✅ Fully Supported |
| Safari | 16.4+ | ✅ Fully Supported |
| Opera | 75+ | ✅ Fully Supported |

### Unsupported

- ❌ Internet Explorer (all versions)
- ❌ Old browser versions (pre-2021)

---

## Troubleshooting

### Issue: Import Map Not Working

**Symptoms:**
- Console errors about module resolution
- `Uncaught TypeError: Failed to resolve module specifier`

**Solution:**
- Check browser version supports Import Maps
- Clear browser cache and reload
- Check browser console for specific errors

---

### Issue: CORS Errors with S3

**Symptoms:**
- `CORS policy: No 'Access-Control-Allow-Origin' header`
- Cannot load profiles from Filebase

**Solution:**

1. Configure CORS on your Filebase bucket
2. Use the provided `cors.json` configuration:

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

3. Apply CORS settings using AWS CLI:
```bash
aws s3api put-bucket-cors \
  --bucket your-bucket-name \
  --cors-configuration file://cors.json \
  --endpoint-url https://s3.filebase.com
```

---

### Issue: 404 Not Found on GitHub Pages

**Symptoms:**
- Main page loads but other files don't
- `/sdk/` files return 404

**Solution:**
- Ensure all files are committed to git
- Check that `.nojekyll` file exists
- Wait a few minutes for GitHub Pages to update
- Check GitHub Pages deployment status in repository settings

---

### Issue: Password Requirements Error

**Symptoms:**
- "Password does not meet security requirements"
- Cannot create account with old password

**Solution:**

New password requirements:
- ✅ Minimum 12 characters (changed from 8)
- ✅ At least one uppercase letter
- ✅ At least one lowercase letter
- ✅ At least one number
- ✅ At least one special character

Example valid password: `MySecure!Pass123`

---

## Security Considerations

### For Public Deployment

If deploying to a public GitHub Pages site:

1. **Never commit credentials**
   - Keep `config.js` in local-only mode (empty credentials)
   - Use `.gitignore` to exclude sensitive files

2. **Content Security Policy**
   - Consider adding CSP headers (requires custom domain or hosting)
   - Restrict script sources to trusted CDNs

3. **HTTPS Only**
   - GitHub Pages uses HTTPS by default ✅
   - Web Crypto API requires HTTPS

4. **Data Privacy**
   - All encryption happens client-side
   - Private keys never leave the browser
   - IndexedDB is isolated per domain

### For Private Deployment

If deploying to private repository with credentials:

1. **Use Repository Secrets**
   - Store credentials as GitHub Secrets
   - Inject during deployment
   - Never commit to source code

2. **Access Control**
   - Make repository private
   - Limit access to trusted collaborators
   - Use GitHub Enterprise for additional controls

---

## Custom Domain (Optional)

To use a custom domain with GitHub Pages:

1. **Add CNAME Record**
   - In your DNS provider, add CNAME record
   - Point to: `yourusername.github.io`

2. **Configure GitHub Pages**
   - Go to repository Settings → Pages
   - Under "Custom domain", enter your domain
   - Check "Enforce HTTPS"

3. **Wait for DNS**
   - DNS propagation can take 24-48 hours
   - GitHub will automatically provision SSL certificate

---

## Local Development

To test locally before deploying:

### Option 1: Python HTTP Server

```bash
cd LocalPod
python3 -m http.server 8000
```

Visit: `http://localhost:8000`

### Option 2: Node.js HTTP Server

```bash
npm install -g http-server
cd LocalPod
http-server -p 8000
```

Visit: `http://localhost:8000`

### Option 3: VS Code Live Server

1. Install "Live Server" extension
2. Right-click `index.html` or `demo.html`
3. Select "Open with Live Server"

---

## Project Structure

```
LocalPod/
├── .nojekyll              # Tells GitHub Pages to skip Jekyll
├── index.html             # Main app (Collaborative Writer)
├── demo.html              # SDK demo (Account Management)
├── app.js                 # Main app logic
├── demo.js                # Demo app logic
├── config.js              # Configuration (default: local-only)
├── config.example.js      # Configuration template
├── storage.js             # S3 storage integration
├── demo.css               # Demo styles
├── styles.css             # Main app styles
├── sdk/                   # Identity Platform SDK
│   ├── index.js           # SDK entry point
│   └── src/               # SDK source code
├── components/            # Web components
└── docs/                  # Documentation
```

---

## Testing the Deployment

After deploying, test these features:

### Basic Functionality
- [ ] Page loads without errors
- [ ] Console shows no errors
- [ ] Can create new account
- [ ] Can unlock existing account
- [ ] Password validation works

### SDK Features
- [ ] Account creation with strong password
- [ ] Login/logout works
- [ ] Brute force protection triggers
- [ ] Profile editing works
- [ ] Collaborator management works

### Advanced Features (if using remote storage)
- [ ] Profile uploads to S3
- [ ] Account backup works
- [ ] Can import account from another device
- [ ] QR code generation works

---

## Next Steps

After successful deployment:

1. ✅ Test all features in live environment
2. ✅ Share demo URL with collaborators
3. ✅ Review security audit: `SECURITY_AUDIT.md`
4. ✅ Read migration guide: `MIGRATION_GUIDE.md`
5. ✅ Set up remote storage (optional)
6. ✅ Configure custom domain (optional)

---

## Getting Help

If you encounter issues:

1. Check browser console for errors
2. Review this guide's troubleshooting section
3. Check GitHub Pages deployment status
4. Open an issue on GitHub repository
5. Review documentation files:
   - `SECURITY_AUDIT.md` - Security improvements
   - `MIGRATION_GUIDE.md` - Breaking changes
   - `SDK_SUMMARY.md` - SDK overview
   - `DEMO_INSTRUCTIONS.md` - Demo usage

---

## Resources

- [GitHub Pages Documentation](https://docs.github.com/en/pages)
- [Import Maps Specification](https://github.com/WICG/import-maps)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [Filebase Documentation](https://docs.filebase.com/)
- [DID Method Specification](https://w3c-ccg.github.io/did-method-key/)

---

**Last Updated:** 2025-10-22
**Deployment Type:** GitHub Pages (Static Hosting)
**Build Required:** No (Pure HTML/JS/CSS)
