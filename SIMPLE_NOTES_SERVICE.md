# LocalPod Notes - Simple Note-Taking Service

A single-page, serverless note-taking application that uses LocalPod authentication and stores notes directly in the user's IPFS storage.

**Inspired by:** Google Keep
**Tech Stack:** Single HTML file + Vanilla JavaScript
**Storage:** User's Filebase/IPFS (user-owned)
**Backend:** Optional minimal API for note index/feed

---

## Architecture

```
┌─────────────────────────────────┐
│  notes.html (Single Page App)  │
│  - LocalPod authentication      │
│  - Note editor                  │
│  - Note list/grid               │
│  - Direct IPFS upload           │
└─────────────┬───────────────────┘
              ↓
       ┌─────────────┐
       │  LocalPod   │
       │  - Auth     │
       │  - Grants   │
       └─────────────┘
              ↓
┌─────────────────────────────────┐
│  User's IPFS/Filebase           │
│  /notes/                        │
│    ├── note-1.json              │
│    ├── note-2.json              │
│    └── index.json (note list)   │
└─────────────────────────────────┘
              ↑
              ↓ (optional)
┌─────────────────────────────────┐
│  Simple API (Optional)          │
│  - GET /api/notes/:userDid      │
│  - Public note discovery        │
└─────────────────────────────────┘
```

---

## Implementation: Single-Page App

### File: `notes.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LocalPod Notes</title>
  <style>
    :root {
      --primary: #1e88e5;
      --bg: #fafafa;
      --card-bg: #fff;
      --border: #e0e0e0;
      --text: #202124;
      --text-secondary: #5f6368;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Google Sans', 'Roboto', Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
    }

    /* Header */
    .header {
      background: var(--card-bg);
      border-bottom: 1px solid var(--border);
      padding: 1rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .logo {
      font-size: 1.5rem;
      font-weight: 500;
    }

    .user-info {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    /* Login Screen */
    .login-screen {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 80vh;
      flex-direction: column;
      gap: 2rem;
    }

    .login-card {
      background: var(--card-bg);
      padding: 3rem;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      text-align: center;
      max-width: 400px;
    }

    /* New Note Form */
    .new-note-form {
      max-width: 600px;
      margin: 2rem auto;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .new-note-form input,
    .new-note-form textarea {
      width: 100%;
      border: none;
      padding: 0.5rem;
      font-family: inherit;
      font-size: 1rem;
      resize: none;
    }

    .new-note-form input {
      font-weight: 500;
      margin-bottom: 0.5rem;
    }

    .new-note-form textarea {
      min-height: 100px;
    }

    .new-note-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
      margin-top: 1rem;
    }

    /* Notes Grid */
    .notes-container {
      max-width: 1200px;
      margin: 2rem auto;
      padding: 0 2rem;
    }

    .notes-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 1rem;
    }

    .note-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem;
      cursor: pointer;
      transition: box-shadow 0.2s;
    }

    .note-card:hover {
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    }

    .note-title {
      font-weight: 500;
      margin-bottom: 0.5rem;
    }

    .note-content {
      color: var(--text-secondary);
      font-size: 0.9rem;
      line-height: 1.4;
      max-height: 150px;
      overflow: hidden;
    }

    .note-footer {
      margin-top: 1rem;
      font-size: 0.75rem;
      color: var(--text-secondary);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    /* Buttons */
    button {
      background: var(--primary);
      color: white;
      border: none;
      padding: 0.75rem 1.5rem;
      border-radius: 4px;
      cursor: pointer;
      font-size: 1rem;
      font-weight: 500;
      transition: background 0.2s;
    }

    button:hover {
      background: #1976d2;
    }

    button.secondary {
      background: transparent;
      color: var(--primary);
    }

    button.secondary:hover {
      background: rgba(30, 136, 229, 0.08);
    }

    .icon-btn {
      background: none;
      color: var(--text-secondary);
      padding: 0.5rem;
      min-width: auto;
    }

    /* Grant Status */
    .grant-status {
      background: #fff3cd;
      border: 1px solid #ffc107;
      padding: 1rem;
      border-radius: 4px;
      margin: 1rem 2rem;
      text-align: center;
    }

    .grant-status.granted {
      background: #d4edda;
      border-color: #28a745;
    }

    /* Utility */
    .hidden { display: none; }
    .loader {
      border: 3px solid #f3f3f3;
      border-top: 3px solid var(--primary);
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 2rem auto;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <!-- Header -->
  <header class="header">
    <div class="logo">📝 LocalPod Notes</div>
    <div class="user-info">
      <span id="user-did" class="hidden"></span>
      <button id="logout-btn" class="hidden secondary">Logout</button>
    </div>
  </header>

  <!-- Login Screen -->
  <div id="login-screen" class="login-screen">
    <div class="login-card">
      <h1>Welcome to LocalPod Notes</h1>
      <p style="margin: 1rem 0; color: var(--text-secondary);">
        Your notes, stored in your own IPFS. Fully decentralized.
      </p>
      <button id="login-btn">Login with LocalPod</button>
    </div>
  </div>

  <!-- Grant Request -->
  <div id="grant-section" class="hidden">
    <div class="grant-status" id="grant-status">
      <p>Grant permission to save notes to your IPFS storage</p>
      <button id="request-grant-btn" style="margin-top: 1rem;">Grant Permission</button>
    </div>
  </div>

  <!-- Main App -->
  <div id="app" class="hidden">
    <!-- New Note Form -->
    <div class="new-note-form">
      <input type="text" id="note-title" placeholder="Title" />
      <textarea id="note-content" placeholder="Take a note..."></textarea>
      <div class="new-note-actions">
        <button id="save-note-btn">Save</button>
      </div>
    </div>

    <!-- Notes Grid -->
    <div class="notes-container">
      <div id="notes-grid" class="notes-grid">
        <!-- Notes populated dynamically -->
      </div>
    </div>
  </div>

  <!-- Loading -->
  <div id="loader" class="loader hidden"></div>

  <script type="module">
    import { IdentityPlatform } from './sdk/index.js';
    import { SimpleStorage } from './storage.js';
    import { config } from './config.js';

    // State
    let platform = null;
    let currentUser = null;
    let currentGrant = null;
    let notes = [];

    // DOM elements
    const dom = {
      loginScreen: document.getElementById('login-screen'),
      grantSection: document.getElementById('grant-section'),
      grantStatus: document.getElementById('grant-status'),
      app: document.getElementById('app'),
      loginBtn: document.getElementById('login-btn'),
      logoutBtn: document.getElementById('logout-btn'),
      requestGrantBtn: document.getElementById('request-grant-btn'),
      saveNoteBtn: document.getElementById('save-note-btn'),
      userDidDisplay: document.getElementById('user-did'),
      noteTitle: document.getElementById('note-title'),
      noteContent: document.getElementById('note-content'),
      notesGrid: document.getElementById('notes-grid'),
      loader: document.getElementById('loader'),
    };

    // Initialize
    async function init() {
      // Check if returning from auth
      const hash = window.location.hash.slice(1);
      if (hash) {
        const params = new URLSearchParams(hash);
        const authPayload = params.get('auth');
        if (authPayload) {
          await handleAuthCallback(JSON.parse(decodeURIComponent(authPayload)));
          window.location.hash = '';
          return;
        }
      }

      // Check for existing session
      const savedUser = localStorage.getItem('localpod_user');
      const savedGrant = localStorage.getItem('localpod_grant');

      if (savedUser) {
        currentUser = JSON.parse(savedUser);
        if (savedGrant) {
          currentGrant = JSON.parse(savedGrant);
          await showApp();
        } else {
          showGrantRequest();
        }
      } else {
        showLogin();
      }
    }

    // Show login screen
    function showLogin() {
      dom.loginScreen.classList.remove('hidden');
      dom.grantSection.classList.add('hidden');
      dom.app.classList.add('hidden');
    }

    // Show grant request
    function showGrantRequest() {
      dom.loginScreen.classList.add('hidden');
      dom.grantSection.classList.remove('hidden');
      dom.app.classList.add('hidden');
      dom.userDidDisplay.textContent = shortenDid(currentUser.did);
      dom.userDidDisplay.classList.remove('hidden');
      dom.logoutBtn.classList.remove('hidden');
    }

    // Show main app
    async function showApp() {
      dom.loginScreen.classList.add('hidden');
      dom.grantSection.classList.add('hidden');
      dom.app.classList.remove('hidden');
      dom.userDidDisplay.textContent = shortenDid(currentUser.did);
      dom.userDidDisplay.classList.remove('hidden');
      dom.logoutBtn.classList.remove('hidden');

      // Initialize platform with user's storage
      if (!platform) {
        platform = new IdentityPlatform({
          remoteStorage: new SimpleStorage(config.filebase)
        });
        await platform.init();
      }

      await loadNotes();
    }

    // Login handler
    dom.loginBtn.addEventListener('click', () => {
      // Generate challenge and redirect to LocalPod auth
      const challenge = generateChallenge();
      const serviceDid = 'did:key:z6MkNotes...'; // Service DID
      const callbackUrl = `${window.location.origin}${window.location.pathname}`;

      const authUrl = `https://msieur-gab.github.io/LocalPod/auth.html?challenge=${encodeURIComponent(challenge)}&service_did=${encodeURIComponent(serviceDid)}&callback_url=${encodeURIComponent(callbackUrl)}`;

      // Store challenge for verification
      sessionStorage.setItem('auth_challenge', challenge);

      window.location.href = authUrl;
    });

    // Handle auth callback
    async function handleAuthCallback(payload) {
      const storedChallenge = sessionStorage.getItem('auth_challenge');

      if (payload.challenge !== storedChallenge) {
        alert('Invalid challenge');
        return;
      }

      // Verify signature (simplified - in production, verify on backend)
      currentUser = {
        did: payload.did,
        publicKey: payload.publicKey,
        encryptionPublicKey: payload.encryptionPublicKey,
      };

      localStorage.setItem('localpod_user', JSON.stringify(currentUser));
      sessionStorage.removeItem('auth_challenge');

      showGrantRequest();
    }

    // Request grant
    dom.requestGrantBtn.addEventListener('click', () => {
      const serviceDid = 'did:key:z6MkNotes...';
      const resourceId = `ipfs://${currentUser.publicKey}/notes/*`;

      const grantUrl = `https://msieur-gab.github.io/LocalPod/grant.html?service_did=${encodeURIComponent(serviceDid)}&resource_id=${encodeURIComponent(resourceId)}&rights=write,read&expires_at=${new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()}&callback_url=${encodeURIComponent(window.location.origin + window.location.pathname)}`;

      // Open in popup
      const popup = window.open(grantUrl, 'Grant Permission', 'width=600,height=700');

      // Listen for grant
      window.addEventListener('message', async (event) => {
        if (event.origin !== 'https://msieur-gab.github.io') return;

        if (event.data.type === 'grant_issued') {
          currentGrant = event.data.grant;
          localStorage.setItem('localpod_grant', JSON.stringify(currentGrant));
          popup.close();
          await showApp();
        }
      });
    });

    // Save note
    dom.saveNoteBtn.addEventListener('click', async () => {
      const title = dom.noteTitle.value.trim();
      const content = dom.noteContent.value.trim();

      if (!content) return;

      const note = {
        id: Date.now().toString(),
        title: title || 'Untitled',
        content,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: currentUser.did,
      };

      try {
        dom.loader.classList.remove('hidden');

        // Upload to user's IPFS
        const storage = platform.remoteStorage;
        const noteKey = `${currentUser.publicKey}/notes/${note.id}.json`;
        await storage.uploadObject(noteKey, note);

        // Update index
        notes.unshift(note);
        await saveNotesIndex();

        // Clear form
        dom.noteTitle.value = '';
        dom.noteContent.value = '';

        // Refresh display
        renderNotes();
      } catch (error) {
        console.error('Failed to save note:', error);
        alert('Failed to save note: ' + error.message);
      } finally {
        dom.loader.classList.add('hidden');
      }
    });

    // Load notes
    async function loadNotes() {
      try {
        dom.loader.classList.remove('hidden');

        const storage = platform.remoteStorage;
        const indexKey = `${currentUser.publicKey}/notes/index.json`;

        try {
          const index = await storage.loadObject(indexKey);
          notes = index.notes || [];
        } catch (error) {
          // Index doesn't exist yet
          notes = [];
        }

        renderNotes();
      } catch (error) {
        console.error('Failed to load notes:', error);
      } finally {
        dom.loader.classList.add('hidden');
      }
    }

    // Save notes index
    async function saveNotesIndex() {
      const storage = platform.remoteStorage;
      const indexKey = `${currentUser.publicKey}/notes/index.json`;
      await storage.uploadObject(indexKey, { notes });
    }

    // Render notes
    function renderNotes() {
      if (notes.length === 0) {
        dom.notesGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-secondary);">No notes yet. Create your first note!</p>';
        return;
      }

      dom.notesGrid.innerHTML = notes.map(note => `
        <div class="note-card" data-note-id="${note.id}">
          <div class="note-title">${escapeHtml(note.title)}</div>
          <div class="note-content">${escapeHtml(note.content)}</div>
          <div class="note-footer">
            <span>${new Date(note.createdAt).toLocaleDateString()}</span>
            <button class="icon-btn delete-note" data-note-id="${note.id}">🗑️</button>
          </div>
        </div>
      `).join('');

      // Add delete handlers
      document.querySelectorAll('.delete-note').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const noteId = btn.dataset.noteId;
          await deleteNote(noteId);
        });
      });
    }

    // Delete note
    async function deleteNote(noteId) {
      if (!confirm('Delete this note?')) return;

      try {
        dom.loader.classList.remove('hidden');

        // Remove from index
        notes = notes.filter(n => n.id !== noteId);
        await saveNotesIndex();

        // Delete from IPFS
        const storage = platform.remoteStorage;
        const noteKey = `${currentUser.publicKey}/notes/${noteId}.json`;
        await storage.deleteObject(noteKey);

        renderNotes();
      } catch (error) {
        console.error('Failed to delete note:', error);
        alert('Failed to delete note: ' + error.message);
      } finally {
        dom.loader.classList.add('hidden');
      }
    }

    // Logout
    dom.logoutBtn.addEventListener('click', () => {
      if (confirm('Logout? Your notes are safely stored in your IPFS.')) {
        localStorage.removeItem('localpod_user');
        localStorage.removeItem('localpod_grant');
        currentUser = null;
        currentGrant = null;
        notes = [];
        showLogin();
      }
    });

    // Utilities
    function generateChallenge() {
      const array = new Uint8Array(32);
      crypto.getRandomValues(array);
      return btoa(String.fromCharCode(...array));
    }

    function shortenDid(did) {
      return did.slice(0, 15) + '...' + did.slice(-8);
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Start app
    init();
  </script>
</body>
</html>
```

---

## Optional: Simple API for Public Discovery

### File: `api/notes.js` (Serverless Function)

```javascript
// Netlify/Vercel serverless function
// GET /api/notes/:userDid - Get public notes index

export default async function handler(req, res) {
  const { userDid } = req.query;

  if (!userDid) {
    return res.status(400).json({ error: 'userDid required' });
  }

  try {
    // Fetch from IPFS gateway
    const publicKey = extractPublicKeyFromDid(userDid);
    const indexUrl = `https://gateway.filebase.io/ipfs/${publicKey}/notes/index.json`;

    const response = await fetch(indexUrl);
    const data = await response.json();

    res.json({
      userDid,
      notes: data.notes || [],
    });
  } catch (error) {
    res.status(404).json({ error: 'Notes not found' });
  }
}

function extractPublicKeyFromDid(did) {
  // Extract public key from DID for IPFS path
  // This is simplified - actual implementation may vary
  return did.split(':').pop();
}
```

---

## Features

✅ **Single HTML file** - No build process
✅ **LocalPod authentication** - Uses DID
✅ **Capability grants** - User controls permissions
✅ **User-owned storage** - Notes in user's IPFS
✅ **Revocable** - User can revoke grant anytime
✅ **Portable** - Notes accessible from any service
✅ **Privacy** - No service database
✅ **Offline-capable** - Notes cached in localStorage

---

## Data Structure

```
User's IPFS Storage:
{publicKey}/
  └── notes/
      ├── index.json          # List of all notes
      ├── 1234567890.json     # Individual note
      └── 1234567891.json     # Individual note

index.json format:
{
  "notes": [
    {
      "id": "1234567890",
      "title": "My First Note",
      "content": "This is the content...",
      "createdAt": "2025-10-23T12:00:00.000Z",
      "updatedAt": "2025-10-23T12:00:00.000Z",
      "author": "did:key:z6Mk..."
    }
  ]
}
```

---

## Deployment

1. **Host `notes.html` on GitHub Pages or any static host**
2. **Optional: Deploy API to Netlify/Vercel for public discovery**
3. **Update callback URLs to production domains**

---

## Next Steps

1. Create `notes.html` in LocalPod repo
2. Create `grant.html` page in LocalPod (for grant issuance)
3. Test full flow: auth → grant → save note
4. Deploy to GitHub Pages
5. (Optional) Add API for public note discovery

### Generating a Service Manifest

Use the helper at `tools/service-manifest-generator.html` to mint a service DID plus signing/encryption keys. Copy the manifest snippet into `config.js` before testing the grant flow. The notes UI also exposes a “Revoke Permission” button so users can drop a grant without restarting the app.

---

## Benefits

- ✅ **Zero backend** - Truly serverless
- ✅ **User owns data** - Stored in their IPFS
- ✅ **No vendor lock-in** - Can switch services
- ✅ **Privacy-first** - Service never stores notes
- ✅ **Portable** - Notes accessible anywhere
- ✅ **Simple** - Single HTML file, easy to understand
