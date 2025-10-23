# Service Authentication Flow

This demonstrates how external services can authenticate users via their LocalPod DID.

## How It Works

1. **Service generates a challenge** (`service.html`)
   - Creates a random challenge string
   - Generates a link to `auth.html` with challenge parameters

2. **User authenticates** (`auth.html`)
   - User unlocks their LocalPod account
   - SDK signs the challenge with their private key
   - Returns payload: `{did, signature, challenge, publicKey, encryptionPublicKey}`
   - Redirects to callback URL

3. **Callback verifies** (`callback.html`)
   - Extracts public key from user's DID
   - Verifies signature matches the challenge
   - Fetches user profile from IPFS/Filebase
   - Stores verified result in sessionStorage
   - Redirects back to service

4. **Service displays user** (`service.html`)
   - Shows authenticated user profile
   - Displays: avatar, name, username, bio, DID
   - User is now logged in to the service!

## Testing Locally

### Setup

1. **Clear IndexedDB** (first time only):
   - Open DevTools > Application > Storage > IndexedDB
   - Right-click `identityPlatform` > Delete
   - OR use an incognito window

2. **Create an account**:
   - Open `http://127.0.0.1:5500/demo.html`
   - Create a new account or unlock existing one

### Testing Flow

1. **Open service page**:
   ```
   http://127.0.0.1:5500/service.html
   ```

2. **Generate challenge**:
   - Click "Generate Challenge"
   - Default callback URL: `http://127.0.0.1:5500/callback.html`

3. **Click the deep link**:
   - Opens `auth.html` with challenge parameters

4. **Authenticate**:
   - Select your account
   - Enter password
   - Click "Authenticate & Approve"

5. **View results**:
   - Redirects to `callback.html`
   - Shows signature verification result
   - Displays user profile from IPFS (if available)

## Response Payload

The signed response includes:

```json
{
  "did": "did:key:z6Mkf5m1X5iYtuoXLiWcZ3t6kYQpo6sDiM8JY2J2RvE5D6Yz",
  "challenge": "original-challenge-string",
  "signature": "base64-encoded-ed25519-signature",
  "publicKey": "base58-encoded-public-key",
  "encryptionPublicKey": "base58-encoded-x25519-key",
  "serviceDid": "did:key:...",
  "issuedAt": "2025-10-23T12:34:56.789Z"
}
```

## Files

- **service.html** - Service that initiates authentication
- **auth.html** - User authentication page
- **callback.html** - Callback handler with verification + IPFS profile fetch
- **sdk/** - Identity Platform SDK with challenge signing

## Production Use

For production, the callback URL should be a server endpoint that:
1. Receives the POST request with the signed payload
2. Verifies the signature server-side
3. Creates a session for the authenticated user
4. Optionally fetches their IPFS profile for display name/avatar

Example callback endpoint:
```javascript
POST /api/auth/callback
Body: {did, signature, challenge, publicKey, ...}

Response:
- 200 OK → session created
- 403 Forbidden → signature invalid
```
