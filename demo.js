/**
 * Identity Platform SDK - Demo Application
 */

import { IdentityPlatform, isPasskeySupported } from '@localPod/identity-platform';
import { getStorageConfig, saveStorageConfig, deleteStorageConfig } from './storage.js';
import { config } from './config.js';
import QRCode from 'qrcode';

// Global state
let platform = null;
let currentIdentity = null;
let currentProfile = null;
let hasRemoteStorage = false;  // Removed old S3 storage - profiles are local-only now
let cachedCollaborators = [];

// Expose for debugging in console
window.debugPlatform = {
  getPlatform: () => platform,
  getIdentity: () => currentIdentity,
  getProfile: () => currentProfile,
};

function buildIdentitySharePayload() {
  if (!currentIdentity) return '';

  return JSON.stringify(
    {
      did: currentIdentity.did,
      publicKey: currentIdentity.signingPublicKey || currentIdentity.publicKey,
      encryptionPublicKey: currentIdentity.encryptionPublicKey ?? null,
      username: currentIdentity.username,
    },
    null,
    2
  );
}

function buildCollaboratorSharePayload(collaborator) {
  return JSON.stringify(
    {
      did: collaborator.did,
      publicKey: collaborator.publicKey,
      encryptionPublicKey: collaborator.encryptionPublicKey,
      name: collaborator.name,
    },
    null,
    2
  );
}

function buildSafeShare(collaborator) {
  return buildCollaboratorSharePayload(collaborator)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n');
}

function parseCollaboratorInput(raw) {
  try {
    const parsed = JSON.parse(raw);
    const publicKey = parsed.publicKey || parsed.signingKey || null;
    const encryptionPublicKey = parsed.encryptionPublicKey || parsed.encryptionKey || null;
    const did = parsed.did || null;
    const name = parsed.name || parsed.displayName || null;

    if (!publicKey) {
      throw new Error('Collaborator share must include publicKey');
    }

    if (!encryptionPublicKey) {
      throw new Error('Collaborator share missing encryptionPublicKey');
    }

    if (!did) {
      throw new Error('Collaborator share must include did');
    }

    return {
      publicKey,
      encryptionPublicKey,
      did,
      name,
    };
  } catch (error) {
    throw new Error('Invalid collaborator share payload. Expect JSON with publicKey and encryptionPublicKey.');
  }
}

// Initialize app
async function init() {
  console.log('Initializing SDK Demo...');

  try {
    // Note: Old Filebase S3 remote storage removed - profiles are now local-only
    // For IPFS storage, users configure Pinata in the UI below
    console.log('ℹ️ Profile storage: Local IndexedDB only');
    console.log('ℹ️ IPFS storage: Configure Pinata below for simple-service.html');

    // Create platform instance (no remote storage)
    platform = new IdentityPlatform();
    await platform.init();

    console.log('✅ SDK initialized');

    // Setup event listeners
    setupEventListeners();

    // Check for existing accounts
    const accounts = await platform.listAccounts();
    console.log(`Found ${accounts.length} accounts`);

    if (accounts.length === 0) {
      showAuthGate('signup');
    } else {
      showAuthGate('login', accounts);
    }

  } catch (error) {
    console.error('Initialization failed:', error);
    showToast('Failed to initialize SDK: ' + error.message, 'error');
  }
}

// Setup event listeners
function setupEventListeners() {
  // Auth mode switcher
  document.getElementById('show-login').addEventListener('click', () => {
    switchAuthMode('login');
  });

  document.getElementById('show-signup').addEventListener('click', () => {
    switchAuthMode('signup');
  });

  document.getElementById('show-import').addEventListener('click', () => {
    switchAuthMode('import');
  });

  // Login form
  document.getElementById('login-form').addEventListener('submit', handleLogin);

  // Signup form
  document.getElementById('signup-form').addEventListener('submit', handleSignup);

  // Import form
  document.getElementById('import-form').addEventListener('submit', handleImportAccount);

  // Main app buttons
  document.getElementById('btn-logout').addEventListener('click', handleLogout);
  document.getElementById('btn-copy-recovery-key').addEventListener('click', handleCopyRecoveryKey);
  document.getElementById('btn-copy-key').addEventListener('click', handleCopyKey);
  document.getElementById('btn-edit-profile').addEventListener('click', showProfileDialog);
  document.getElementById('btn-add-collaborator').addEventListener('click', showAddCollaboratorForm);
  document.getElementById('btn-cancel-add').addEventListener('click', hideAddCollaboratorForm);

  const passkeyButton = document.getElementById('btn-register-passkey');
  if (passkeyButton) {
    if (!isPasskeySupported()) {
      passkeyButton.style.display = 'none';
    } else {
      passkeyButton.addEventListener('click', handleRegisterPasskey);
    }
  }

  // Add collaborator form
  document.getElementById('add-collaborator-form').addEventListener('submit', handleAddCollaborator);

  // QR Scanner
  document.getElementById('btn-scan-collaborator').addEventListener('click', openScanner);
  const scanner = document.getElementById('collaborator-scanner');
  scanner.addEventListener('collaborator-scanned', handleScannedCollaborator);
  scanner.addEventListener('scan-error', (e) => {
    showToast(`Scan error: ${e.detail.error}`, 'error');
  });

  // Profile dialog
  document.getElementById('profile-form').addEventListener('submit', handleSaveProfile);
  document.getElementById('btn-cancel-profile').addEventListener('click', hideProfileDialog);
  document.getElementById('btn-remove-avatar').addEventListener('click', handleRemoveAvatar);
  document.getElementById('profile-avatar').addEventListener('change', handleAvatarPreview);

  // Storage configuration form
  document.getElementById('storage-config-form').addEventListener('submit', handleSaveStorageConfig);
  document.getElementById('btn-clear-storage-config').addEventListener('click', handleClearStorageConfig);
  document.getElementById('ipfs-provider').addEventListener('change', handleProviderChange);

  // Setup password visibility toggles
  setupPasswordToggles();
}

// Setup password visibility toggle functionality
function setupPasswordToggles() {
  const toggleButtons = document.querySelectorAll('.password-toggle');

  toggleButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetId = button.getAttribute('data-target');
      const input = document.getElementById(targetId);
      const eyeShow = button.querySelector('.eye-show');
      const eyeHide = button.querySelector('.eye-hide');

      if (!input || !eyeShow || !eyeHide) return;

      if (input.type === 'password') {
        // Show password
        input.type = 'text';
        eyeShow.style.display = 'none';
        eyeHide.style.display = 'block';
      } else {
        // Hide password
        input.type = 'password';
        eyeShow.style.display = 'block';
        eyeHide.style.display = 'none';
      }
    });
  });
}

// Show authentication gate
async function showAuthGate(mode = 'login', accounts = []) {
  const authGate = document.getElementById('auth-gate');
  const mainApp = document.getElementById('main-app');
  const modeSwitcher = document.getElementById('mode-switcher');
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const authMessage = document.getElementById('auth-message');

  authGate.style.display = 'block';
  mainApp.style.display = 'none';

  if (accounts.length > 0) {
    // Populate login username dropdown
    const select = document.getElementById('login-username');
    select.innerHTML = '<option value="">Select account...</option>';
    accounts.forEach(account => {
      const option = document.createElement('option');
      option.value = account.username;
      option.textContent = account.username;
      select.appendChild(option);
    });

    modeSwitcher.style.display = 'flex';
    authMessage.textContent = 'Welcome back! Unlock your account, create a new one, or import from backup.';
  } else {
    modeSwitcher.style.display = 'flex';
    authMessage.textContent = 'Create your first decentralized identity or import an existing one.';
  }

  switchAuthMode(mode);
}

// Switch between login, signup, and import modes
function switchAuthMode(mode) {
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const importForm = document.getElementById('import-form');
  const loginBtn = document.getElementById('show-login');
  const signupBtn = document.getElementById('show-signup');
  const importBtn = document.getElementById('show-import');

  // Hide all forms
  loginForm.style.display = 'none';
  signupForm.style.display = 'none';
  importForm.style.display = 'none';

  // Remove all active classes
  loginBtn.classList.remove('active');
  signupBtn.classList.remove('active');
  importBtn.classList.remove('active');

  // Show selected form
  if (mode === 'login') {
    loginForm.style.display = 'block';
    loginBtn.classList.add('active');
  } else if (mode === 'signup') {
    signupForm.style.display = 'block';
    signupBtn.classList.add('active');
  } else if (mode === 'import') {
    importForm.style.display = 'block';
    importBtn.classList.add('active');
  }

  // Clear errors
  document.getElementById('login-error').style.display = 'none';
  document.getElementById('signup-error').style.display = 'none';
  document.getElementById('import-error').style.display = 'none';
  document.getElementById('import-status').style.display = 'none';
}

// Handle login
async function handleLogin(event) {
  event.preventDefault();

  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  const errorDiv = document.getElementById('login-error');

  try {
    errorDiv.style.display = 'none';
    console.log('Attempting login for:', username);

    currentIdentity = await platform.unlock({ username, password });

    console.log('✅ Login successful');
    showToast(`Welcome back, ${username}!`, 'success');

    // Show main app
    await showMainApp();

  } catch (error) {
    console.error('Login failed:', error);
    errorDiv.textContent = error.message;
    errorDiv.style.display = 'block';
  }
}

// Handle signup
async function handleSignup(event) {
  event.preventDefault();

  const username = document.getElementById('signup-username').value.trim();
  const password = document.getElementById('signup-password').value;
  const confirm = document.getElementById('signup-confirm').value;
  const errorDiv = document.getElementById('signup-error');

  try {
    errorDiv.style.display = 'none';

    // Validate
    if (password !== confirm) {
      throw new Error('Passwords do not match');
    }

    console.log('Creating account for:', username);

    currentIdentity = await platform.createAccount({ username, password });

    console.log('✅ Account created');
    showToast(`Account created successfully! Welcome, ${username}!`, 'success');

    // Show main app
    await showMainApp();

  } catch (error) {
    console.error('Signup failed:', error);
    errorDiv.textContent = error.message;
    errorDiv.style.display = 'block';
  }
}

// Handle import account
async function handleImportAccount(event) {
  event.preventDefault();

  const publicKey = document.getElementById('import-publickey').value.trim();
  const username = document.getElementById('import-username').value.trim();
  const password = document.getElementById('import-password').value;
  const errorDiv = document.getElementById('import-error');
  const statusDiv = document.getElementById('import-status');

  try {
    errorDiv.style.display = 'none';
    statusDiv.style.display = 'none';

    if (!hasRemoteStorage) {
      throw new Error('Remote storage not configured. Cannot fetch backup from Filebase.');
    }

    statusDiv.style.display = 'block';
    statusDiv.textContent = '🔍 Fetching your encrypted backup from Filebase...';

    console.log('Importing account for public key:', publicKey);

    // Fetch the unified user file to get the encrypted backup
    const userFile = await platform.remoteStorage.loadUnifiedUser(publicKey);

    if (!userFile) {
      throw new Error('No backup found for this public key on Filebase.');
    }

    if (!userFile.private) {
      throw new Error('This account has no encrypted backup. Cannot recover.');
    }

    statusDiv.textContent = '🔓 Decrypting your private key...';

    // Import account from backup
    const backup = {
      publicKey,
      encryptedPrivateKey: userFile.private.cipher,
      encryptionIv: userFile.private.iv,
      salt: userFile.private.salt,
      iterations: userFile.private.iterations,
      encryptedEncryptionKey: userFile.private.encryptionCipher ?? null,
      encryptionKeyIv: userFile.private.encryptionIv ?? null,
      encryptionSalt: userFile.private.encryptionSalt ?? null,
      encryptionIterations: userFile.private.encryptionIterations ?? 600000,
      encryptionPublicKey: userFile.encryptionPublicKey ?? null,
    };

    currentIdentity = await platform.importAccountFromBackup({
      username,
      password,
      backup,
    });

    console.log('✅ Account imported successfully');

    // Also import the profile data
    if (userFile.public) {
      await platform.saveProfile({
        publicKey: currentIdentity.publicKey,
        encryptionPublicKey: currentIdentity.encryptionPublicKey,
        username: userFile.public.username || username,
        displayName: userFile.public.displayName || username,
        avatar: userFile.public.avatar,
        bio: userFile.public.bio,
      });
      console.log('✅ Profile data imported');
    }

    showToast(`Account recovered successfully! Welcome back, ${userFile.public?.displayName || username}!`, 'success');

    // Show main app
    await showMainApp();

  } catch (error) {
    console.error('Import failed:', error);
    statusDiv.style.display = 'none';
    errorDiv.textContent = error.message;
    errorDiv.style.display = 'block';
  }
}

// Handle logout
function handleLogout() {
  platform.lock();
  currentIdentity = null;
  currentProfile = null;
  cachedCollaborators = [];

  // Clear forms
  document.getElementById('login-password').value = '';
  document.getElementById('signup-username').value = '';
  document.getElementById('signup-password').value = '';
  document.getElementById('signup-confirm').value = '';

  showToast('Account locked', 'info');

  // Reload to show auth gate
  init();
}

// Handle copy recovery key (raw signing key for backups)
async function handleCopyRecoveryKey() {
  if (!currentIdentity) return;

  const signingKey = currentIdentity.signingPublicKey || currentIdentity.publicKey;

  try {
    await navigator.clipboard.writeText(signingKey);
    showToast('Recovery public key copied to clipboard.', 'success');
  } catch (error) {
    console.error('Copy recovery key failed:', error);
    showToast('Failed to copy recovery key. Check browser permissions.', 'error');
  }
}

// Handle copy collaboration share payload
async function handleCopyKey() {
  if (!currentIdentity) return;

  try {
    await navigator.clipboard.writeText(buildIdentitySharePayload());
    showToast('Collaboration share JSON copied to clipboard.', 'success');
  } catch (error) {
    console.error('Copy failed:', error);
    showToast('Failed to copy. Check browser permissions.', 'error');
  }
}

async function handleRegisterPasskey() {
  if (!currentIdentity) {
    showToast('Unlock your account before registering a passkey.', 'error');
    return;
  }

  try {
    await platform.registerPasskey({
      displayName: currentProfile?.displayName || currentIdentity.username,
    });
    showToast('Passkey registered for this account.', 'success');
    await renderIdentity();
  } catch (error) {
    console.error('Passkey registration failed:', error);
    showToast('Failed to register passkey: ' + error.message, 'error');
  }
}

// Show main app
async function showMainApp() {
  document.getElementById('auth-gate').style.display = 'none';
  document.getElementById('main-app').style.display = 'block';

  await loadCurrentProfile();
  await renderIdentity();
  await renderQRCode();
  await renderCollaborators();
  await renderStats();
  await loadStorageConfigUI();  // Load storage provider configuration
}

// Load current user's profile
async function loadCurrentProfile() {
  if (!currentIdentity) return;

  currentProfile = await platform.getProfile(currentIdentity.publicKey);

  if (!currentProfile) {
    // Create default profile and sync to remote if available
    currentProfile = await platform.saveProfile({
      publicKey: currentIdentity.publicKey,
      encryptionPublicKey: currentIdentity.encryptionPublicKey,
      username: currentIdentity.username, // Include username in profile
      displayName: currentIdentity.username,
      avatar: null,
      bio: null
    }, { syncRemote: hasRemoteStorage });

    if (hasRemoteStorage) {
      console.log('✅ Initial profile synced to Filebase (with encrypted backup)');
    }
  }
}

// Render identity card
async function renderIdentity() {
  if (!currentIdentity) return;

  const container = document.getElementById('identity-info');
  const displayName = currentProfile?.displayName || currentIdentity.username;
  const bio = currentProfile?.bio || '';
  let passkeyCount = 0;

  try {
    const passkeys = await platform.listPasskeys();
    passkeyCount = passkeys.length;
  } catch (error) {
    console.warn('Unable to load passkey list:', error);
  }

  container.innerHTML = `
    <div class="info-row">
      <span class="label">Display Name:</span>
      <span class="value">${displayName}</span>
    </div>
    ${bio ? `
    <div class="info-row">
      <span class="label">Bio:</span>
      <span class="value">${bio}</span>
    </div>
    ` : ''}
    <div class="info-row">
      <span class="label">Username:</span>
      <span class="value">${currentIdentity.username}</span>
    </div>
    <div class="info-row">
      <span class="label">DID:</span>
      <span class="value monospace">${shortenDID(currentIdentity.did)}</span>
    </div>
    <div class="info-row">
      <span class="label">Signing Key:</span>
      <span class="value monospace">${shortenKey(currentIdentity.signingPublicKey || currentIdentity.publicKey)}</span>
    </div>
    <div class="info-row">
      <span class="label">Encryption Key:</span>
      <span class="value monospace">${currentIdentity.encryptionPublicKey ? shortenKey(currentIdentity.encryptionPublicKey) : '—'}</span>
    </div>
    <div class="info-row">
      <span class="label">Passkeys:</span>
      <span class="value">${passkeyCount}</span>
    </div>
    <div class="info-row">
      <span class="label">Created:</span>
      <span class="value">${formatDate(currentIdentity.createdAt)}</span>
    </div>
  `;

  // Show avatar or QR code
  const qrDisplay = document.getElementById('qr-code-display');
  const avatarDisplay = document.getElementById('avatar-display');
  const avatarImg = document.getElementById('avatar-img');

  if (currentProfile?.avatar) {
    qrDisplay.style.display = 'none';
    avatarDisplay.style.display = 'block';
    avatarImg.src = currentProfile.avatar;
  } else {
    qrDisplay.style.display = 'block';
    avatarDisplay.style.display = 'none';
  }
}

// Render QR code
async function renderQRCode() {
  if (!currentIdentity) return;

  try {
    const canvas = document.getElementById('qr-canvas');
    await QRCode.toCanvas(canvas, buildIdentitySharePayload(), {
      width: 180,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#f8fbff'
      }
    });
  } catch (error) {
    console.error('Failed to generate QR code:', error);
  }
}

// Render collaborators list
async function renderCollaborators() {
  const container = document.getElementById('collaborators-list');

  try {
    // Sync profiles from remote storage if available to get latest updates
    if (hasRemoteStorage) {
      console.log('🔄 Syncing collaborator profiles from remote storage...');
    }

    const collaborators = await platform.listCollaboratorsWithProfiles({
      syncRemote: hasRemoteStorage
    });

    cachedCollaborators = collaborators;

    if (hasRemoteStorage) {
      console.log(`✅ Loaded ${collaborators.length} collaborators with synced profiles`);
    }

    if (collaborators.length === 0) {
      container.innerHTML = '<p class="empty-state">No collaborators yet. Add your first collaborator to get started!</p>';
      return;
    }

    container.innerHTML = collaborators.map(collab => {
      const displayName = collab.profile?.displayName || collab.name || 'Unknown';
      const username = collab.profile?.username || '';
      const bio = collab.profile?.bio || '';
      const avatar = collab.profile?.avatar || null;
      const publicKey = collab.publicKey;
      const encryptionKey = collab.encryptionPublicKey;
      const did = collab.did;
      const collabId = collab.id;
      const hasRemoteProfile = collab.profile?.displayName || collab.profile?.avatar || collab.profile?.bio;

      return `
        <div class="collaborator-card" data-collab-id="${collabId}">
          ${avatar ? `
            <div class="collaborator-avatar">
              <img src="${avatar}" alt="${displayName}" />
            </div>
          ` : `
            <div class="collaborator-avatar-placeholder">
              ${displayName.charAt(0).toUpperCase()}
            </div>
          `}
          <div class="collaborator-info">
            <div class="collaborator-header">
              <div class="collaborator-name">${displayName}</div>
              ${hasRemoteProfile ? '<span class="badge badge-success">✓ Profile Loaded</span>' : ''}
            </div>
            ${username ? `<div class="collaborator-username">@${username}</div>` : ''}
            ${bio ? `<div class="collaborator-bio">${bio}</div>` : ''}
            <div class="collaborator-key">Signing: ${shortenKey(publicKey)}</div>
            <div class="collaborator-key">Encryption: ${shortenKey(encryptionKey)}</div>
            ${did ? `<div class="collaborator-did">DID: ${shortenDID(did)}</div>` : ''}
          </div>
          <div class="collaborator-actions">
            <button class="btn btn-small btn-secondary" onclick="copyToClipboard('${buildSafeShare(collab)}')">Copy Share</button>
            <button class="btn btn-small btn-primary" onclick="handleIssueCapability('${collabId}')">Issue Capability</button>
            <button class="btn btn-small btn-danger" onclick="handleRemoveCollaborator('${collabId}', '${displayName.replace(/'/g, "\\'")}')">Remove</button>
          </div>
        </div>
      `;
    }).join('');

  } catch (error) {
    console.error('Failed to render collaborators:', error);
    container.innerHTML = '<p class="error">Failed to load collaborators</p>';
  }
}

// Render statistics
async function renderStats() {
  const container = document.getElementById('stats-display');

  try {
    const stats = await platform.getStats();

    container.innerHTML = `
      <div class="stat-card">
        <div class="stat-value">${stats.accounts}</div>
        <div class="stat-label">Accounts</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.collaborators}</div>
        <div class="stat-label">Collaborators</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.profiles}</div>
        <div class="stat-label">Profiles</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.cacheStats.size}</div>
        <div class="stat-label">Cached Profiles</div>
      </div>
    `;

  } catch (error) {
    console.error('Failed to render stats:', error);
  }
}

// Show add collaborator form
function showAddCollaboratorForm() {
  document.getElementById('add-collaborator-section').style.display = 'block';

  // Update remote storage status
  const statusSpan = document.getElementById('remote-status');
  if (statusSpan) {
    if (hasRemoteStorage) {
      statusSpan.textContent = 'ENABLED ✓';
      statusSpan.style.color = 'var(--success)';
    } else {
      statusSpan.textContent = 'not configured';
      statusSpan.style.color = 'var(--error)';
    }
  }

  document.getElementById('collaborator-name').focus();
}

// Open QR scanner
function openScanner() {
  const scanner = document.getElementById('collaborator-scanner');
  scanner.open('camera'); // Start with camera mode
}

// Handle scanned collaborator from QR code
async function handleScannedCollaborator(event) {
  const collaboratorData = event.detail;

  console.log('Collaborator scanned:', collaboratorData);

  try {
    // Check if encryptionPublicKey is null and warn
    if (!collaboratorData.encryptionPublicKey) {
      const confirmAdd = confirm(
        `⚠️ Warning: ${collaboratorData.username || 'This collaborator'} has no encryption key.\n\n` +
        'Encrypted collaboration (capability grants, document sharing) will not be possible.\n\n' +
        'Do you want to add them anyway?'
      );

      if (!confirmAdd) {
        showToast('Scan cancelled', 'info');
        return;
      }
    }

    // Show loading toast
    showToast('Adding collaborator...', 'info');

    // Add collaborator to platform
    await platform.addCollaborator({
      publicKey: collaboratorData.publicKey,
      encryptionPublicKey: collaboratorData.encryptionPublicKey,
      did: collaboratorData.did,
      name: collaboratorData.name || collaboratorData.username || null
    }, { createProfile: true });

    console.log('✅ Collaborator added from QR scan');

    // Get the profile to show success message
    const profile = await platform.getProfile(collaboratorData.publicKey);
    const displayName = profile?.displayName || collaboratorData.username || 'Collaborator';

    let successMsg = `${displayName} added successfully!`;
    if (hasRemoteStorage) {
      if (profile?.username || profile?.bio || profile?.avatar) {
        successMsg += ' Profile loaded from remote.';
      } else {
        successMsg += ' No remote profile found.';
      }
    }

    showToast(successMsg, 'success');

    // Refresh collaborators list
    await renderCollaborators();
    await renderStats();

  } catch (error) {
    console.error('Failed to add scanned collaborator:', error);
    showToast(`Failed to add collaborator: ${error.message}`, 'error');
  }
}

// Hide add collaborator form
function hideAddCollaboratorForm() {
  document.getElementById('add-collaborator-section').style.display = 'none';
  document.getElementById('add-collaborator-form').reset();
  document.getElementById('add-collaborator-error').style.display = 'none';
}

// Handle add collaborator
async function handleAddCollaborator(event) {
  event.preventDefault();

  const name = document.getElementById('collaborator-name').value.trim();
  const publicKey = document.getElementById('collaborator-key').value.trim();
  const errorDiv = document.getElementById('add-collaborator-error');
  const statusDiv = document.getElementById('add-collaborator-status');

  try {
    errorDiv.style.display = 'none';

    if (!hasRemoteStorage && !name) {
      errorDiv.textContent = 'Remote storage not configured. Please provide a display name.';
      errorDiv.style.display = 'block';
      return;
    }

    statusDiv.style.display = 'block';
    if (hasRemoteStorage) {
      statusDiv.textContent = '🔍 Adding collaborator and fetching profile...';
    } else {
      statusDiv.textContent = '➕ Adding collaborator...';
    }

    console.log('Adding collaborator:', publicKey);

    let capabilityPayload = null;
    try {
      capabilityPayload = JSON.parse(publicKey);
    } catch {
      capabilityPayload = null;
    }

    if (capabilityPayload && capabilityPayload.signature) {
      await platform.acceptCapabilityGrant(capabilityPayload);
      showToast('Capability grant imported successfully!', 'success');
      hideAddCollaboratorForm();
      await renderCollaborators();
      await renderStats();
      return;
    }

    const descriptor = parseCollaboratorInput(publicKey);

    await platform.addCollaborator({
      ...descriptor,
      name: name || descriptor.name || null
    }, { createProfile: true });

    console.log('✅ Collaborator added');

    // Get the profile to show success message
    const profile = await platform.getProfile(descriptor.publicKey);
    const displayName = profile?.displayName || name || 'Collaborator';

    let successMsg = `${displayName} added successfully!`;
    if (hasRemoteStorage) {
      if (profile?.username || profile?.bio || profile?.avatar) {
        successMsg += ' Profile loaded from remote.';
      } else {
        successMsg += ' No remote profile found - using provided name.';
      }
    } else {
      successMsg += ' (Local only - remote storage not configured)';
    }

    showToast(successMsg, 'success');

    hideAddCollaboratorForm();
    await renderCollaborators();
    await renderStats();

  } catch (error) {
    console.error('Failed to add collaborator:', error);
    statusDiv.style.display = 'none';
    errorDiv.textContent = error.message;
    errorDiv.style.display = 'block';
  }
}

async function handleIssueCapability(collabId) {
  const collaborator = cachedCollaborators.find((c) => c.id === collabId);
  if (!collaborator) {
    showToast('Collaborator not found', 'error');
    return;
  }

  const resourceId = prompt('Resource identifier to share (e.g., doc-123)');
  if (!resourceId) {
    return;
  }

  const rightsInput = prompt('Comma-separated rights (e.g., read,write)', 'read');
  const rights = rightsInput
    ? rightsInput
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    : [];

  const expiryInput = prompt('Expiry in days (leave empty for none)');
  let expiresAt = null;
  if (expiryInput) {
    const days = Number.parseInt(expiryInput, 10);
    if (!Number.isNaN(days) && days > 0) {
      expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    }
  }

  try {
    const grant = await platform.issueCapabilityGrant({
      subjectDid: collaborator.did,
      subjectEncryptionPublicKey: collaborator.encryptionPublicKey,
      resourceId,
      rights,
      expiresAt,
      metadata: {
        collaboratorName: collaborator.name ?? null,
      },
    });

    const grantJson = JSON.stringify(grant, null, 2);
    await navigator.clipboard.writeText(grantJson);
    showToast('Capability grant copied to clipboard.', 'success');
  } catch (error) {
    console.error('Capability issuance failed:', error);
    showToast('Failed to issue capability: ' + error.message, 'error');
  }
}

// Handle remove collaborator
async function handleRemoveCollaborator(collabId, displayName) {
  // Ask for confirmation
  const confirmed = confirm(`Are you sure you want to remove "${displayName}" from your collaborators?`);

  if (!confirmed) {
    return;
  }

  try {
    console.log('Removing collaborator:', collabId);

    await platform.removeCollaborator(collabId);

    showToast(`${displayName} removed successfully`, 'success');

    // Re-render collaborators and stats
    await renderCollaborators();
    await renderStats();

  } catch (error) {
    console.error('Failed to remove collaborator:', error);
    showToast('Failed to remove collaborator: ' + error.message, 'error');
  }
}

// Make it globally available for onclick
window.handleRemoveCollaborator = handleRemoveCollaborator;

// Profile dialog functions
function showProfileDialog() {
  const dialog = document.getElementById('profile-dialog');
  const displayNameInput = document.getElementById('profile-displayname');
  const bioInput = document.getElementById('profile-bio');

  // Pre-fill with current profile
  displayNameInput.value = currentProfile?.displayName || currentIdentity?.username || '';
  bioInput.value = currentProfile?.bio || '';

  // Show current avatar if exists
  if (currentProfile?.avatar) {
    const preview = document.getElementById('avatar-preview');
    const previewImg = document.getElementById('avatar-preview-img');
    previewImg.src = currentProfile.avatar;
    preview.style.display = 'block';
  }

  dialog.style.display = 'flex';
}

function hideProfileDialog() {
  const dialog = document.getElementById('profile-dialog');
  const form = document.getElementById('profile-form');
  const preview = document.getElementById('avatar-preview');

  dialog.style.display = 'none';
  form.reset();
  preview.style.display = 'none';
}

async function handleSaveProfile(event) {
  event.preventDefault();

  if (!currentIdentity) return;

  const displayName = document.getElementById('profile-displayname').value.trim();
  const bio = document.getElementById('profile-bio').value.trim();
  const avatarInput = document.getElementById('profile-avatar');

  try {
    let avatarData = currentProfile?.avatar || null;

    // If new avatar uploaded, read as base64
    if (avatarInput.files && avatarInput.files[0]) {
      avatarData = await readFileAsDataURL(avatarInput.files[0]);
    }

    // Update profile (sync to remote if available)
    currentProfile = await platform.updateProfile(
      currentIdentity.publicKey,
      {
        displayName: displayName || currentIdentity.username,
        bio: bio || null,
        avatar: avatarData
      },
      { syncRemote: hasRemoteStorage } // Auto-sync to Filebase if enabled
    );

    const syncMsg = hasRemoteStorage ? ' Profile synced to Filebase!' : ' (Saved locally only)';
    showToast('Profile updated successfully!' + syncMsg, 'success');
    hideProfileDialog();

    // Re-render identity card
    await renderIdentity();
    await renderQRCode();

  } catch (error) {
    console.error('Failed to update profile:', error);
    showToast('Failed to update profile: ' + error.message, 'error');
  }
}

function handleRemoveAvatar() {
  const preview = document.getElementById('avatar-preview');
  const avatarInput = document.getElementById('profile-avatar');

  preview.style.display = 'none';
  avatarInput.value = '';

  if (currentProfile) {
    currentProfile.avatar = null;
  }
}

function handleAvatarPreview(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const preview = document.getElementById('avatar-preview');
    const previewImg = document.getElementById('avatar-preview-img');

    previewImg.src = e.target.result;
    preview.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

// Utility: Read file as data URL
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
}

// =============================================================================
// STORAGE CONFIGURATION HANDLERS
// =============================================================================

/**
 * Handle provider selection change - update help text and links
 */
function handleProviderChange(event) {
  const provider = event.target.value;
  const helpText = document.getElementById('provider-help-text');
  const helpLinks = document.getElementById('provider-help-links');
  const gatewayInput = document.getElementById('provider-gateway');

  // Update help text and placeholder based on provider
  if (provider === 'pinata') {
    helpText.textContent = 'Get your free API key at app.pinata.cloud';
    gatewayInput.placeholder = 'gateway.pinata.cloud';
    helpLinks.innerHTML = `
      <p>📘 <strong>Pinata Setup:</strong></p>
      <ol>
        <li>Sign up for a free account at <a href="https://app.pinata.cloud" target="_blank">app.pinata.cloud</a></li>
        <li>Go to API Keys section</li>
        <li>Create a new API key with upload permissions</li>
        <li>Copy the JWT token and paste it above</li>
      </ol>
      <p><small>Free tier: 1GB storage, 3GB bandwidth/month</small></p>
    `;
    helpLinks.style.display = 'block';
  } else if (provider === 'scaleway') {
    helpText.textContent = 'Scaleway Labs IPFS - Coming Soon';
    gatewayInput.placeholder = 'ipfs.scaleway.com';
    helpLinks.innerHTML = `<p>🇫🇷 Scaleway Labs IPFS provider (French sovereignty) - Implementation coming soon</p>`;
    helpLinks.style.display = 'block';
  } else if (provider === '4everland') {
    helpText.textContent = '4everland - Coming Soon';
    gatewayInput.placeholder = '4everland.io';
    helpLinks.innerHTML = `<p>🌐 4everland decentralized storage - Implementation coming soon</p>`;
    helpLinks.style.display = 'block';
  } else {
    helpText.textContent = 'Select a provider above';
    helpLinks.style.display = 'none';
  }
}

/**
 * Handle save storage configuration
 */
async function handleSaveStorageConfig(event) {
  event.preventDefault();

  const provider = document.getElementById('ipfs-provider').value;
  const jwt = document.getElementById('provider-jwt').value.trim();
  const gateway = document.getElementById('provider-gateway').value.trim();

  const statusEl = document.getElementById('storage-config-status');
  const errorEl = document.getElementById('storage-config-error');

  // Clear previous messages
  statusEl.style.display = 'none';
  errorEl.style.display = 'none';

  try {
    if (!provider) {
      throw new Error('Please select a provider');
    }

    if (!jwt) {
      throw new Error('Please enter your API key');
    }

    // Validate provider is implemented
    if (provider !== 'pinata') {
      throw new Error(`${provider} provider is not yet implemented. Please use Pinata for now.`);
    }

    // Encrypt the JWT using user's private key
    if (!currentIdentity) {
      throw new Error('You must be logged in to save storage configuration');
    }

    const encoder = new TextEncoder();
    const jwtBytes = encoder.encode(jwt);

    // Generate random salt and IV
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Get the private key bytes from the SDK (it's not exposed in currentIdentity)
    const privateKeyBytes = platform.accountService.getSigningPrivateKeyBytes();
    if (!privateKeyBytes) {
      throw new Error('Private key not available. Please logout and login again.');
    }

    console.log('🔑 Using private key for encryption:', privateKeyBytes.length, 'bytes');

    // Derive encryption key from user's signing private key using HKDF
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      privateKeyBytes,
      { name: 'HKDF' },
      false,
      ['deriveKey']
    );

    const encryptionKey = await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        salt: salt,
        info: encoder.encode('pinata-jwt-encryption'),
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    // Encrypt the JWT
    const encryptedJwt = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      encryptionKey,
      jwtBytes
    );

    // Convert to base64 for storage
    const encryptedJwtB64 = btoa(String.fromCharCode(...new Uint8Array(encryptedJwt)));
    const ivB64 = btoa(String.fromCharCode(...iv));
    const saltB64 = btoa(String.fromCharCode(...salt));

    // Save to IndexedDB
    await saveStorageConfig({
      provider: provider,
      encryptedJwt: encryptedJwtB64,
      encryptionIv: ivB64,
      encryptionSalt: saltB64,
      gateway: gateway || null
    });

    statusEl.textContent = `✅ ${provider} configuration saved successfully!`;
    statusEl.style.display = 'block';

    // Clear the JWT input for security
    document.getElementById('provider-jwt').value = '';

    showToast('Storage configuration saved!', 'success');

  } catch (error) {
    console.error('Failed to save storage config:', error);
    errorEl.textContent = error.message;
    errorEl.style.display = 'block';
  }
}

/**
 * Handle clear storage configuration
 */
async function handleClearStorageConfig() {
  if (!confirm('Are you sure you want to clear your storage configuration? This will remove your API key.')) {
    return;
  }

  try {
    await deleteStorageConfig();

    // Clear form
    document.getElementById('ipfs-provider').value = '';
    document.getElementById('provider-jwt').value = '';
    document.getElementById('provider-gateway').value = '';
    document.getElementById('provider-help-links').style.display = 'none';

    const statusEl = document.getElementById('storage-config-status');
    statusEl.textContent = '✅ Storage configuration cleared';
    statusEl.style.display = 'block';

    showToast('Storage configuration cleared', 'success');

  } catch (error) {
    console.error('Failed to clear storage config:', error);
    const errorEl = document.getElementById('storage-config-error');
    errorEl.textContent = error.message;
    errorEl.style.display = 'block';
  }
}

/**
 * Load and display current storage configuration
 */
async function loadStorageConfigUI() {
  try {
    const config = await getStorageConfig();

    if (config) {
      // Populate the form with saved config (but not the JWT for security)
      document.getElementById('ipfs-provider').value = config.provider;
      if (config.gateway) {
        document.getElementById('provider-gateway').value = config.gateway;
      }

      // Trigger the change event to update help text
      document.getElementById('ipfs-provider').dispatchEvent(new Event('change'));

      const statusEl = document.getElementById('storage-config-status');
      statusEl.textContent = `ℹ️ Current provider: ${config.provider} (configured on ${new Date(config.updatedAt).toLocaleDateString()})`;
      statusEl.style.display = 'block';
    }
  } catch (error) {
    // Ignore "table not found" errors - this happens on first run or after schema upgrade
    if (error.name === 'NotFoundError') {
      console.log('ℹ️ Storage config table not found - this is normal for first run');
    } else {
      console.error('Failed to load storage config:', error);
    }
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

// Utility: Copy to clipboard (global function for onclick)
window.copyToClipboard = async function(text) {
  try {
    const normalized = text
      .replace(/\\n/g, '\n')
      .replace(/\\\\/g, '\\');
    await navigator.clipboard.writeText(normalized);
    showToast('Copied to clipboard!', 'success');
  } catch (error) {
    console.error('Copy failed:', error);
    showToast('Failed to copy', 'error');
  }
};

window.handleIssueCapability = handleIssueCapability;

// Utility: Shorten DID
function shortenDID(did) {
  if (!did) return '';
  return did.slice(0, 20) + '...' + did.slice(-8);
}

// Utility: Shorten key
function shortenKey(key) {
  if (!key) return '—';
  return key.slice(0, 12) + '...' + key.slice(-8);
}

// Utility: Format date
function formatDate(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

// Utility: Show toast notification
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast toast-${type}`;
  toast.style.display = 'block';

  setTimeout(() => {
    toast.style.display = 'none';
  }, 3000);
}

// Start the app
init();
