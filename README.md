# LocalPod - Decentralized Identity Platform SDK

A privacy-focused, decentralized identity platform SDK for building encrypted, collaborative applications with DID-based authentication.

---

## 🚀 Quick Start

### Try the Live Demo

Visit the GitHub Pages demo (replace with your URL after deployment):
- **Main App**: `https://yourusername.github.io/LocalPod/`
- **SDK Demo**: `https://yourusername.github.io/LocalPod/demo.html`

### Local Development

```bash
# Clone the repository
git clone https://github.com/yourusername/LocalPod.git
cd LocalPod

# Serve locally (Python)
python3 -m http.server 8000

# Or use Node.js
npx http-server -p 8000

# Visit: http://localhost:8000
```

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| **[GITHUB_PAGES.md](./GITHUB_PAGES.md)** | Deploy to GitHub Pages - **START HERE** |
| **[SECURITY_AUDIT.md](./SECURITY_AUDIT.md)** | Comprehensive security audit and improvements |
| **[MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)** | Migration guide for security updates |
| **[SDK_SUMMARY.md](./SDK_SUMMARY.md)** | SDK architecture and API reference |
| **[DEMO_INSTRUCTIONS.md](./DEMO_INSTRUCTIONS.md)** | How to use the demo applications |

---

## ✨ Features

### Security & Privacy
- 🔒 **End-to-End Encryption** - AES-256-GCM authenticated encryption
- 🔐 **DID-based Identity** - Decentralized identifiers (did:key method)
- 🔑 **Strong Key Derivation** - PBKDF2 (600k iterations) + HKDF
- ✍️ **Message Signing** - ECDSA signatures for authenticity
- 🛡️ **Brute Force Protection** - Exponential backoff on failed logins
- 🎯 **Zero Knowledge** - Private keys never leave your device

### SDK Capabilities
- 👤 **Account Management** - Create, unlock, lock, delete accounts
- 🤝 **Collaborator Management** - Trust network for sharing
- 📝 **Profile System** - User profiles with avatar, bio, etc.
- 💾 **Local Storage** - IndexedDB for encrypted data
- ☁️ **Remote Sync** - Optional S3-compatible backup (Filebase)
- 📱 **QR Code Sharing** - Share identities via QR codes

### Cryptography Stack
- **Encryption**: AES-256-GCM (Web Crypto API)
- **Key Agreement**: ECDH with secp256k1
- **Key Derivation**: HKDF-SHA256 (Web Crypto API)
- **Password Hashing**: PBKDF2-SHA256 (600k iterations)
- **Digital Signatures**: ECDSA-secp256k1
- **Random Generation**: crypto.getRandomValues()

---

## 🎯 Use Cases

- **Collaborative Document Editing** - Encrypted, real-time collaboration
- **Secure Messaging** - End-to-end encrypted peer-to-peer messages
- **Identity Management** - Self-sovereign identity for Web3 apps
- **File Sharing** - Encrypted file sharing with access control
- **Decentralized Apps** - Building blocks for privacy-first dApps

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                 Application Layer                        │
│  (Your App, Demo App, Collaborative Writer)             │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│            Identity Platform SDK (./sdk/)                │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Account    │  │   Profile    │  │ Collaborator │  │
│  │   Service    │  │   Service    │  │   Service    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │         Core Cryptography Module                  │  │
│  │  • ECDH Key Agreement (secp256k1)                │  │
│  │  • HKDF Key Derivation                           │  │
│  │  • AES-256-GCM Encryption                        │  │
│  │  • ECDSA Signing/Verification                    │  │
│  │  • PBKDF2 Password Hashing                       │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │         DID (Decentralized Identity)              │  │
│  │  • did:key method implementation                 │  │
│  │  • secp256k1 key pair generation                │  │
│  │  • Public key validation                         │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│                  Storage Layer                           │
│                                                          │
│  ┌──────────────┐              ┌──────────────┐        │
│  │   IndexedDB  │              │   S3 (Remote)│        │
│  │   (Local)    │              │   (Optional) │        │
│  └──────────────┘              └──────────────┘        │
└─────────────────────────────────────────────────────────┘
```

---

## 🔧 Technology Stack

### Core Dependencies
- **[@noble/secp256k1](https://github.com/paulmillr/noble-secp256k1)** - Elliptic curve cryptography
- **[@scure/base](https://github.com/paulmillr/scure-base)** - Base58 encoding for DIDs
- **[dexie](https://dexie.org/)** - IndexedDB wrapper

### Browser APIs
- **Web Crypto API** - Native cryptographic operations
- **IndexedDB** - Browser-based storage
- **ES Modules** - Modern JavaScript modules
- **Import Maps** - Dependency resolution

### Demo Dependencies
- **[Lit](https://lit.dev/)** - Web components (main app only)
- **[QRCode](https://github.com/soldair/node-qrcode)** - QR code generation
- **[QR Scanner](https://github.com/nimiq/qr-scanner)** - QR code scanning

---

## 📦 Project Structure

```
LocalPod/
├── sdk/                    # Identity Platform SDK
│   ├── index.js            # Public API exports
│   ├── src/
│   │   ├── core/           # Cryptography & DID
│   │   ├── services/       # Account, Profile, Collaborator
│   │   ├── storage/        # Database layer
│   │   └── utils/          # Encoding utilities
│   └── package.json
│
├── index.html              # Main app (Collaborative Writer)
├── demo.html               # SDK demo (Account Management)
├── app.js                  # Main app logic
├── demo.js                 # Demo app logic
├── storage.js              # S3 storage integration
├── components/             # Lit web components
│
├── config.js               # Default config (local-only)
├── config.example.js       # Config template
│
└── Documentation
    ├── GITHUB_PAGES.md     # Deployment guide ⭐
    ├── SECURITY_AUDIT.md   # Security improvements
    ├── MIGRATION_GUIDE.md  # Breaking changes guide
    ├── SDK_SUMMARY.md      # SDK reference
    └── DEMO_INSTRUCTIONS.md # Demo usage
```

---

## 🔐 Security

LocalPod has undergone a comprehensive security audit. Key improvements:

✅ **Enhanced Key Derivation** - HKDF for ECDH shared secrets
✅ **Authenticated Encryption** - Digital signatures prevent MITM attacks
✅ **Private Key Protection** - Never exposed via public API
✅ **Strong Passwords** - 12+ chars with complexity requirements
✅ **Brute Force Protection** - Exponential backoff after 3 failed attempts
✅ **Web Crypto API** - Uses native browser cryptography
✅ **Minimal Dependencies** - Well-audited, zero-dependency libraries

See [SECURITY_AUDIT.md](./SECURITY_AUDIT.md) for full details.

---

## 🚀 Deployment

### GitHub Pages (Recommended)

1. **Enable GitHub Pages**
   - Repository Settings → Pages
   - Source: Deploy from branch → main → / (root)
   - Save and wait 1-2 minutes

2. **Visit Your Demo**
   - `https://yourusername.github.io/LocalPod/`

3. **Read Full Guide**
   - See [GITHUB_PAGES.md](./GITHUB_PAGES.md) for complete instructions

### Other Hosting Options

Works with any static hosting:
- Vercel
- Netlify
- Cloudflare Pages
- AWS S3 + CloudFront
- Any web server

---

## 💡 Usage Examples

### Create Account

```javascript
import { IdentityPlatform } from '@localPod/identity-platform';

const platform = new IdentityPlatform();
await platform.init();

// Create new account (requires strong password)
const identity = await platform.createAccount({
  username: 'alice',
  password: 'MySecure!Pass123' // 12+ chars with complexity
});

console.log(identity.did); // did:key:z...
```

### Encrypt Message (Authenticated)

```javascript
import { encryptAndSignForRecipient } from '@localPod/identity-platform';

// Encrypt + Sign in one operation
const { ciphertext, iv, signature } = await encryptAndSignForRecipient(
  "Secret message",
  recipientPublicKey,
  myPrivateKey
);

// Recipient decrypts and verifies signature
const plaintext = await decryptAndVerifyFromSender(
  ciphertext,
  iv,
  signature,
  senderPublicKey,
  myPrivateKey
);
```

### Add Collaborator

```javascript
// Add trusted collaborator
await platform.addCollaborator({
  publicKey: 'base58-encoded-public-key',
  name: 'Bob'
});

// Check if trusted
const isTrusted = await platform.isTrustedCollaborator(publicKey);
```

---

## 🌟 What's New

### Recent Security Enhancements (v1.0.0)

**Breaking Changes:**
- ⚠️ Private keys no longer exposed in `getUnlockedIdentity()`
- ⚠️ Password requirements increased to 12 characters with complexity
- ℹ️ Login attempts tracked with exponential backoff

**New Features:**
- ✅ HKDF-based key derivation for ECDH
- ✅ Authenticated encryption with digital signatures
- ✅ Password strength validation
- ✅ Brute force protection

See [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) for migration instructions.

---

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

### Development Setup

```bash
# Clone repo
git clone https://github.com/yourusername/LocalPod.git
cd LocalPod

# No build step required! Just serve the files:
python3 -m http.server 8000

# Visit http://localhost:8000
```

---

## 📝 License

MIT License - see LICENSE file for details

---

## 🔗 Related Projects

- [Solid Project](https://solidproject.org/) - Tim Berners-Lee's decentralized web
- [DID:Key Method](https://w3c-ccg.github.io/did-method-key/) - DID specification
- [Web Crypto API](https://www.w3.org/TR/WebCryptoAPI/) - Browser cryptography standard

---

## 📧 Support

- **Documentation**: See `./docs/` folder
- **Issues**: Open an issue on GitHub
- **Security**: Report vulnerabilities privately (see SECURITY_AUDIT.md)

---

## ⭐ Getting Started Checklist

- [ ] Read [GITHUB_PAGES.md](./GITHUB_PAGES.md) for deployment
- [ ] Try the live demo (after deployment)
- [ ] Review [SECURITY_AUDIT.md](./SECURITY_AUDIT.md) for security details
- [ ] Check [SDK_SUMMARY.md](./SDK_SUMMARY.md) for API reference
- [ ] Read [DEMO_INSTRUCTIONS.md](./DEMO_INSTRUCTIONS.md) for demo usage
- [ ] Set up remote storage (optional)
- [ ] Build your first app with the SDK!

---

**Built with privacy, security, and decentralization in mind.**

**Last Updated:** 2025-10-22
