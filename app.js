import { LitElement, html, css } from 'lit';
import { SimpleDID, encoding } from './crypto.js';
import { config } from './config.js';
import {
  SimpleStorage,
  listCollaborators,
  addCollaborator,
  listDocuments,
  saveDocumentMetadata,
  getDocumentMetadata,
  saveSharedKeysForDocument,
  getSharedKey,
  getSharedKeysForPublicKey,
  saveProfile,
  getProfile,
} from './storage.js';

import './components/identity-card.js';
import './components/add-friend.js';
import './components/editor.js';
import './components/doc-list.js';
import './components/account-gate.js';
import './components/share-dialog.js';
import './components/profile-editor.js';

const createBlankDocument = () => ({
  id: crypto.randomUUID(),
  title: 'Untitled Document',
  content: '',
  collaborators: [],
  cid: null,
  iv: null,
  ownerPublicKey: null,
  wrappedKeys: {},
  preview: '',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

class CollabWriter extends LitElement {
  static properties = {
    identity: { state: true },
    accounts: { state: true },
    collaborators: { state: true },
    documents: { state: true },
    currentDoc: { state: true },
    showAddFriend: { state: true },
    status: { state: true },
    isUnlocked: { state: true },
    showShareDialog: { state: true },
    shareDoc: { state: true },
    profiles: { state: true },
  };

  constructor() {
    super();
    this.identity = null;
    this.accounts = [];
    this.storage = null;
    this.collaborators = [];
    this.documents = [];
    this.currentDoc = null;
    this.showAddFriend = false;
    this.status = '';
    this.isUnlocked = false;
    this.showShareDialog = false;
    this.shareDoc = null;
    this.profiles = [];

    try {
      if (config?.filebase?.accessKey && config.filebase.secretKey && config.filebase.bucket) {
        this.storage = new SimpleStorage(config.filebase);
      } else {
        console.warn('Filebase credentials missing in config.js');
      }
    } catch (error) {
      console.warn('Unable to initialize Filebase storage', error);
    }
  }

  static styles = css`
    :host {
      display: block;
    }

    header {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    header h1 {
      font-size: clamp(2.2rem, 4vw, 3rem);
      margin: 0;
    }

    header p {
      margin: 0;
      color: var(--text-muted);
      max-width: 720px;
      line-height: 1.5;
    }

    .layout {
      display: grid;
      gap: 2rem;
      grid-template-columns: minmax(0, 320px) minmax(0, 1fr);
      align-items: start;
    }

    @media (max-width: 900px) {
      .layout {
        grid-template-columns: 1fr;
      }
    }

    aside {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    main {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .status {
      padding: 0.75rem 1rem;
      border-radius: var(--radius-sm);
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 0.95rem;
    }
  `;

  async firstUpdated() {
    await this.loadAccounts();
    if (this.accounts.length === 0) {
      this.status = 'Create a secure identity to get started.';
      return;
    }
    this.status = 'Unlock your workspace to continue.';
  }

  async loadAccounts() {
    this.accounts = await SimpleDID.listAccounts();
  }

  async refreshCollaborators() {
    this.collaborators = await listCollaborators();
  }

  async refreshDocuments() {
    const docs = await listDocuments();
    if (!this.identity) {
      this.documents = docs;
      return;
    }

    const publicKey = this.identity.publicKey;
    const accessibleMap = new Map();
    const collaboratorKeys = new Set([publicKey]);

    const sharedEntries = await getSharedKeysForPublicKey(publicKey);
    for (const entry of sharedEntries) {
      const doc = await getDocumentMetadata(entry.docId);
      if (!doc) continue;
      if (!doc.wrappedKeys) {
        doc.wrappedKeys = {};
      }
      if (!doc.wrappedKeys[publicKey]) {
        doc.wrappedKeys = { ...doc.wrappedKeys, [publicKey]: entry.encryptedKey };
        await saveDocumentMetadata(doc);
      }
      accessibleMap.set(doc.id, doc);
      if (doc.ownerPublicKey) collaboratorKeys.add(doc.ownerPublicKey);
      (doc.collaborators ?? []).forEach((key) => collaboratorKeys.add(key));
    }

    for (const doc of docs) {
      if (!doc) continue;
      if (!doc.wrappedKeys) {
        doc.wrappedKeys = {};
      }
      const hasSelfKey = Object.prototype.hasOwnProperty.call(doc.wrappedKeys, publicKey);
      const isOwner =
        doc.ownerPublicKey === publicKey ||
        (!doc.ownerPublicKey && hasSelfKey) ||
        (doc.ownerPublicKey === undefined && doc.collaborators?.includes(publicKey));

      if (isOwner && !hasSelfKey) {
        const entry = await getSharedKey({ docId: doc.id, publicKey });
        if (entry?.encryptedKey) {
          doc.wrappedKeys = { ...doc.wrappedKeys, [publicKey]: entry.encryptedKey };
        }
      }

      if ((isOwner || hasSelfKey) && !accessibleMap.has(doc.id)) {
        accessibleMap.set(doc.id, doc);
        if (doc.wrappedKeys && Object.keys(doc.wrappedKeys).length > 0) {
          await saveSharedKeysForDocument(doc.id, doc.wrappedKeys);
        }
        if (doc.ownerPublicKey) collaboratorKeys.add(doc.ownerPublicKey);
        (doc.collaborators ?? []).forEach((key) => collaboratorKeys.add(key));
        continue;
      }

      if (!accessibleMap.has(doc.id) && !doc.ownerPublicKey && Object.keys(doc.wrappedKeys ?? {}).length === 0) {
        accessibleMap.set(doc.id, doc);
      }
    }

    const accessibleDocs = Array.from(accessibleMap.values()).sort((a, b) => {
      const aTime = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
      const bTime = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
      return bTime - aTime;
    });

    for (const doc of accessibleDocs) {
      const uniqueKeys = new Set(doc.collaborators ?? []);
      doc.collaboratorCount = uniqueKeys.size;
      const hasSelf = Object.prototype.hasOwnProperty.call(doc.wrappedKeys ?? {}, publicKey);
      if (doc.ownerPublicKey === publicKey) {
        doc.accessLevel = 'owner';
      } else if (hasSelf) {
        doc.accessLevel = 'collaborator';
      } else {
        doc.accessLevel = 'legacy';
      }
    }

    await this.ensureCollaboratorProfiles(collaboratorKeys);

    const ownerMap = new Map(this.profiles.map((profile) => [profile.publicKey, profile.displayName]));
    for (const doc of accessibleDocs) {
      if (!doc) continue;
      if (doc.ownerPublicKey === publicKey) {
        doc.ownerDisplayName = 'You';
      } else if (doc.ownerPublicKey && ownerMap.has(doc.ownerPublicKey)) {
        doc.ownerDisplayName = ownerMap.get(doc.ownerPublicKey) ?? doc.ownerPublicKey.slice(0, 10) + '…';
      } else if (doc.ownerPublicKey) {
        doc.ownerDisplayName = doc.ownerPublicKey.slice(0, 10) + '…';
      }
    }

    this.documents = accessibleDocs;
  }

  async afterUnlock() {
    if (this.storage) {
      await this.syncRemoteDocuments();
    }
    await this.refreshCollaborators();
    await this.refreshDocuments();
    await this.publishIdentityArtifacts();
    await this.hydrateSelfProfile();
  }

  applyGateError(message) {
    this.status = message;
    const gate = this.renderRoot?.querySelector('account-gate');
    if (gate) {
      gate.form = { ...gate.form, error: message };
    }
  }

  async handleAccountCreated(event) {
    const { username, password } = event.detail ?? {};
    try {
      const identity = await SimpleDID.createAccount({ username, password });
      await this.loadAccounts();
      this.identity = { ...identity, displayName: identity.username ?? '', avatar: null };
      this.isUnlocked = true;
      this.status = `Created secure identity for ${identity.username}.`;
      await this.afterUnlock();
    } catch (error) {
      console.error('Account creation failed', error);
      this.applyGateError(error.message ?? 'Unable to create account.');
    }
  }

  async handleAccountUnlock(event) {
    const { username, password } = event.detail ?? {};
    try {
      const identity = await SimpleDID.unlock({ username, password });
      this.identity = { ...identity };
      this.isUnlocked = true;
      this.status = `Unlocked workspace for ${identity.username}.`;
      await this.afterUnlock();
    } catch (error) {
      if (error.message?.toLowerCase().includes('account not found') && this.storage) {
        try {
          const { identity } = await this.restoreAccountFromBackup(username, password);
          await this.loadAccounts();
          this.identity = { ...identity };
          this.isUnlocked = true;
          this.status = `Restored workspace for ${identity.username}.`;
          await this.afterUnlock();
        } catch (restoreError) {
          console.error('Account restore failed', restoreError);
          this.applyGateError(restoreError.message ?? 'Unable to restore account.');
        }
      } else {
        console.error('Authentication failed', error);
        this.applyGateError(error.message ?? 'Login failed.');
      }
    }
  }

  handleAddFriendRequest() {
    this.showAddFriend = true;
  }

  handleFriendDialogClose() {
    this.showAddFriend = false;
  }

  async handleCollaboratorAdded(event) {
    const collaborator = event.detail;
    if (!collaborator) return;
    await addCollaborator(collaborator);
    if (collaborator.publicKey && collaborator.name) {
      await saveProfile({
        publicKey: collaborator.publicKey,
        displayName: collaborator.name,
      });
    }
    await this.refreshCollaborators();
    this.status = `Added collaborator ${collaborator.name ?? collaborator.publicKey.slice(0, 10)}…`;
    this.showAddFriend = false;
  }

  handleNewDocument() {
    const draft = createBlankDocument();
    draft.ownerPublicKey = this.identity?.publicKey ?? null;
    this.currentDoc = draft;
  }

  async handleDocumentSelected(event) {
    const docId = event.detail?.id;
    if (!docId) return;
    const doc = await getDocumentMetadata(docId);
    if (!doc) {
      this.status = 'Document not found locally.';
      return;
    }
    const hydrated = await this.ensureDocumentContent(doc);
    this.currentDoc = hydrated;
  }

  async handleDocumentSaved(event) {
    const doc = event.detail;
    if (!doc) return;
    await this.persistDocument(doc);
  }

  async persistDocument(doc, previousCollaboratorsOverride = null) {
    if (!this.identity) {
      this.status = 'Identity not initialized.';
      return;
    }

    const existingRecord = await getDocumentMetadata(doc.id);
    const previousCollaborators =
      previousCollaboratorsOverride !== null && previousCollaboratorsOverride !== undefined
        ? previousCollaboratorsOverride instanceof Set
          ? new Set(previousCollaboratorsOverride)
          : new Set(previousCollaboratorsOverride)
        : new Set(existingRecord?.collaborators ?? []);
    const createdAt = existingRecord?.createdAt ?? doc.createdAt ?? new Date().toISOString();

    const updated = {
      ...existingRecord,
      ...doc,
      ownerPublicKey: doc.ownerPublicKey ?? this.identity.publicKey,
      createdAt,
      updatedAt: new Date().toISOString(),
      collaborators: Array.from(new Set(doc.collaborators ?? [])),
      content: doc.content ?? existingRecord?.content ?? '',
    };

    try {
      const recipientSet = new Set(updated.collaborators ?? []);
      if (updated.ownerPublicKey) {
        recipientSet.add(updated.ownerPublicKey);
      }

      this.status = 'Encrypting document…';
      const encrypted = await SimpleDID.encryptDocument(updated.content ?? '', Array.from(recipientSet), {
        includeSelf: true,
      });

      updated.iv = encrypted.iv;
      updated.wrappedKeys = encrypted.wrappedKeys;
      updated.preview = (updated.content ?? '').slice(0, 160);
      await saveSharedKeysForDocument(updated.id, encrypted.wrappedKeys);

      let metadataPayload = null;

      if (this.storage) {
        this.status = 'Uploading encrypted content…';
        const cipherBytes = encoding.base64ToBytes(encrypted.ciphertext);
        const { cid } = await this.storage.saveDocument(updated.id, cipherBytes);
        if (cid) {
          updated.cid = cid;
        } else if (!updated.cid) {
          updated.cid = existingRecord?.cid ?? null;
        }
        metadataPayload = {
          version: 1,
          id: updated.id,
          title: updated.title,
          ownerPublicKey: updated.ownerPublicKey,
          collaborators: updated.collaborators,
          wrappedKeys: updated.wrappedKeys,
          iv: updated.iv,
          cid: updated.cid ?? null,
          preview: updated.preview,
          updatedAt: updated.updatedAt,
          createdAt: updated.createdAt,
        };
        await this.updateRemoteIndexes(updated, previousCollaborators, metadataPayload);
      } else {
        this.status = 'Saved locally. Configure Filebase to enable syncing.';
      }

      await saveDocumentMetadata(updated);
      await this.refreshDocuments();
      this.currentDoc = updated;
      if (this.storage) {
        this.status = updated.cid ? `Saved “${updated.title}” to Filebase (CID ${updated.cid.slice(0, 12)}…)` : `Saved “${updated.title}”`;
      }
    } catch (error) {
      console.error('Failed to persist document', error);
      this.status = `Save failed: ${error.message ?? error}`;
    }
  }

  async handleBackToList() {
    this.currentDoc = null;
    if (this.storage && this.identity) {
      await this.syncRemoteDocuments();
    }
    await this.refreshDocuments();
  }

  handleShareRequested(event) {
    const doc = event.detail;
    if (!doc?.id) return;
    this.shareDoc = {
      ...doc,
      collaborators: Array.from(new Set(doc.collaborators ?? [])),
    };
    this.showShareDialog = true;
  }

  async handleShareConfirmed(event) {
    const { docId, collaborators } = event.detail ?? {};
    this.showShareDialog = false;
    if (!docId) return;
    const unique = Array.from(new Set(collaborators ?? []));
    const existing = await getDocumentMetadata(docId);
    const previousSet = new Set(existing?.collaborators ?? []);
    if (this.currentDoc && this.currentDoc.id === docId) {
      const updated = {
        ...this.currentDoc,
        collaborators: unique,
      };
      this.currentDoc = updated;
      await this.persistDocument(updated, previousSet);
    } else {
      if (!existing) return;
      const hydrated = await this.ensureDocumentContent(existing);
      const updated = {
        ...hydrated,
        collaborators: unique,
      };
      await this.persistDocument(updated, previousSet);
      if (this.currentDoc?.id === docId) {
        this.currentDoc = updated;
      }
    }
    this.shareDoc = null;
  }

  handleShareCancelled() {
    this.showShareDialog = false;
    this.shareDoc = null;
  }

  async publishIdentityArtifacts() {
    try {
      const account = SimpleDID.getCurrentAccount();
      if (!account) return;
      const backup = SimpleDID.getBackupPayload();
      const mapping = SimpleDID.getAccountMapping();
      const profilePayload = {
        publicKey: account.publicKey,
        displayName:
          this.identity?.displayName ?? mapping?.username ?? account.publicKey.slice(0, 10) + '…',
        avatar: this.identity?.avatar || null,
        updatedAt: new Date().toISOString(),
      };
      await saveProfile(profilePayload);
      this.identity = {
        ...this.identity,
        displayName: profilePayload.displayName,
        avatar: profilePayload.avatar,
      };

      const selfProfile = await getProfile(account.publicKey);
      if (selfProfile) {
        const others = (this.profiles ?? []).filter((profile) => profile.publicKey !== account.publicKey);
        this.profiles = [...others, selfProfile];
      }

      if (!this.storage) {
        await this.hydrateSelfProfile();
        return;
      }
      if (backup) {
        await this.storage.saveIdentityBackup(backup.publicKey, backup);
      }
      if (mapping?.username && mapping.publicKey) {
        await this.storage.saveAccountLookup(mapping.username, {
          username: mapping.username,
          publicKey: mapping.publicKey,
        });
      }
      await this.storage.upsertProfile(account.publicKey, profilePayload);
      await this.hydrateSelfProfile();
    } catch (error) {
      console.warn('Failed to publish identity artifacts', error);
    }
  }

  async updateRemoteIndexes(doc, previousCollaborators, metadataPayload) {
    if (!this.storage) return;
    try {
      if (metadataPayload) {
        await this.storage.saveDocumentMetadataFile(doc.id, metadataPayload);
      }

      const entry = {
        id: doc.id,
        title: doc.title,
        ownerPublicKey: doc.ownerPublicKey,
        cid: doc.cid ?? null,
        updatedAt: doc.updatedAt,
      };

      const ownerKey = doc.ownerPublicKey;
      const currentCollaborators = new Set(doc.collaborators ?? []);
      currentCollaborators.delete(ownerKey);

      await this.storage.upsertUserIndex(ownerKey, entry);
      for (const collaborator of currentCollaborators) {
        await this.storage.upsertUserIndex(collaborator, entry);
      }

      for (const removed of previousCollaborators) {
        if (removed === ownerKey) continue;
        if (!currentCollaborators.has(removed)) {
          await this.storage.removeFromUserIndex(removed, doc.id);
        }
      }
    } catch (error) {
      console.warn('Failed to update remote indexes', error);
    }
  }

  async syncRemoteDocuments() {
    if (!this.storage || !this.identity) return;
    try {
      const publicKey = this.identity.publicKey;
      const index = await this.storage.loadUserIndex(publicKey);
      const entries = index?.docs ?? [];

      for (const entry of entries) {
        try {
          const metadata = await this.storage.loadDocumentMetadata(entry.id);
          if (!metadata) continue;
          const existing = await getDocumentMetadata(entry.id);
          const existingUpdatedAt = existing?.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
          const remoteUpdatedAt = metadata?.updatedAt ? new Date(metadata.updatedAt).getTime() : 0;
          if (existing && existingUpdatedAt >= remoteUpdatedAt) {
            continue;
          }
          let record = {
            ...existing,
            ...metadata,
            preview: metadata.preview ?? existing?.preview ?? '',
          };
          record.content = '';
          record.collaborators = Array.isArray(record.collaborators) ? record.collaborators : [];
          record.wrappedKeys = record.wrappedKeys ?? {};
          record.ownerPublicKey =
            record.ownerPublicKey ?? metadata.ownerPublicKey ?? entry.ownerPublicKey ?? this.identity.publicKey;
          record.cid = record.cid ?? metadata.cid ?? entry.cid ?? null;
          record.createdAt =
            record.createdAt ?? metadata.createdAt ?? existing?.createdAt ?? metadata.updatedAt ?? new Date().toISOString();
          await saveDocumentMetadata(record);
          await saveSharedKeysForDocument(metadata.id, metadata.wrappedKeys ?? {});
          record = await this.decryptDocumentContent(record);
        } catch (error) {
          console.warn(`Failed to sync remote document ${entry.id}`, error);
        }
      }
    } catch (error) {
      console.warn('Remote sync failed', error);
    }
  }

  async ensureDocumentContent(doc) {
    if (doc?.content && doc.content.length > 0) {
      return doc;
    }
    if (!this.storage || !doc?.iv || !doc?.wrappedKeys) {
      return doc;
    }

    const publicKey = this.identity?.publicKey;
    let selfKey = doc.wrappedKeys[publicKey];
    if (!selfKey) {
      const entry = await getSharedKey({ docId: doc.id, publicKey });
      if (entry?.encryptedKey) {
        selfKey = entry.encryptedKey;
        doc.wrappedKeys = { ...doc.wrappedKeys, [publicKey]: selfKey };
        await saveDocumentMetadata(doc);
      }
    }

    if (!selfKey) {
      this.status = 'No decryption key stored for your identity.';
      return doc;
    }

    return this.decryptDocumentContent({ ...doc, wrappedKeys: { ...doc.wrappedKeys, [publicKey]: selfKey } });
  }

  async decryptDocumentContent(doc) {
    if (!this.storage || !this.identity) return doc;
    const publicKey = this.identity.publicKey;
    const selfKey = doc.wrappedKeys?.[publicKey];
    if (!selfKey || !doc.iv) return doc;

    try {
      const cipherBytes = await this.storage.loadDocument(doc.id);
      const payload = {
        ciphertext: encoding.bytesToBase64(cipherBytes),
        iv: doc.iv,
        wrappedKey: selfKey,
      };
      const content = await SimpleDID.decryptDocument(payload, doc.ownerPublicKey ?? publicKey);
      const hydrated = { ...doc, content, preview: content.slice(0, 160) };
      await saveDocumentMetadata(hydrated);
      return hydrated;
    } catch (error) {
      console.error('Failed to load document', error);
      this.status = `Load failed: ${error.message ?? error}`;
      return doc;
    }
  }

  async restoreAccountFromBackup(username, password) {
    if (!this.storage) {
      throw new Error('Remote storage not configured');
    }
    const normalized = username?.trim();
    if (!normalized) {
      throw new Error('Username is required');
    }
    const mapping = await this.storage.loadAccountLookup(normalized);
    if (!mapping?.publicKey) {
      throw new Error('No remote account found for this username');
    }
    const backup = await this.storage.loadIdentityBackup(mapping.publicKey);
    if (!backup) {
      throw new Error('No remote backup available for this account');
    }
    const identity = await SimpleDID.importAccountFromBackup({ username: normalized, password, backup });
    return { identity, mapping };
  }

  async ensureCollaboratorProfiles(publicKeys) {
    if (!publicKeys || publicKeys.size === 0) return;
    const missing = [];
    for (const key of publicKeys) {
      if (!key) continue;
      const profile = await getProfile(key);
      if (!profile) {
        missing.push(key);
      }
    }

    if (this.storage && missing.length > 0) {
      for (const key of missing) {
        try {
          const remoteProfile = await this.storage.loadProfile(key);
          if (remoteProfile) {
            await saveProfile(remoteProfile);
          }
        } catch (error) {
          console.warn(`Failed to load profile for ${key}`, error);
        }
      }
    }

    const profileMap = new Map();
    for (const key of publicKeys) {
      const profile = await getProfile(key);
      if (profile) {
        profileMap.set(profile.publicKey, profile);
      }
    }
    this.profiles = Array.from(profileMap.values());
    await this.hydrateSelfProfile();

  }

  async hydrateSelfProfile() {
    if (!this.identity?.publicKey) return;
    const profile = await getProfile(this.identity.publicKey);
    if (profile) {
      this.identity = {
        ...this.identity,
        displayName: profile.displayName ?? this.identity.displayName ?? this.identity.username ?? '',
        avatar: profile.avatar ?? this.identity.avatar ?? null,
      };
      const others = (this.profiles ?? []).filter((item) => item.publicKey !== profile.publicKey);
      this.profiles = [...others, profile];
    }
  }

  async handleProfileUpdated(event) {
    const { displayName, avatar } = event.detail ?? {};
    if (!this.identity?.publicKey) return;
    const updatedIdentity = {
      ...this.identity,
      displayName: displayName ?? this.identity.displayName ?? this.identity.username ?? '',
      avatar: avatar || null,
    };
    this.identity = updatedIdentity;
    await saveProfile({
      publicKey: updatedIdentity.publicKey,
      displayName: updatedIdentity.displayName,
      avatar: updatedIdentity.avatar,
    });
    if (this.storage) {
      await this.storage.upsertProfile(updatedIdentity.publicKey, {
        publicKey: updatedIdentity.publicKey,
        displayName: updatedIdentity.displayName,
        avatar: updatedIdentity.avatar,
      });
    }
    await this.publishIdentityArtifacts();
    await this.hydrateSelfProfile();
    this.status = 'Profile updated.';
  }

  renderFriendDialog() {
    if (!this.showAddFriend) return null;
    return html`
      <add-friend
        @close-dialog=${this.handleFriendDialogClose}
        @collaborator-added=${this.handleCollaboratorAdded}
      ></add-friend>
    `;
  }

  renderMainArea() {
    if (!this.currentDoc) {
      return html`
        <doc-list
          .documents=${this.documents}
          @new-document=${this.handleNewDocument}
          @open-document=${this.handleDocumentSelected}
        ></doc-list>
      `;
    }

    return html`
      <doc-editor
        .doc=${this.currentDoc}
        .collaborators=${this.collaborators}
        .profiles=${this.profiles}
        .currentPublicKey=${this.identity?.publicKey ?? ''}
        @save-document=${this.handleDocumentSaved}
        @share-document=${this.handleShareRequested}
        @back=${this.handleBackToList}
      ></doc-editor>
    `;
  }

  render() {
    if (!this.isUnlocked) {
      return html`
        <account-gate
          .accounts=${this.accounts}
          @create-account=${this.handleAccountCreated.bind(this)}
          @unlock-account=${this.handleAccountUnlock.bind(this)}
        ></account-gate>
        ${this.status ? html`<div class="status">${this.status}</div>` : null}
      `;
    }

    if (!this.identity) {
      return html`<div class="card">Initializing secure workspace…</div>`;
    }

    return html`
      <header>
        <h1>🔒 Secure Collaborative Writer</h1>
        <p>
          Generate a decentralized identity, share your public key with collaborators, and co-write encrypted markdown
          documents pinned to IPFS through Filebase.
        </p>
        ${!this.storage
          ? html`<div class="status">Filebase not configured. Documents save locally until credentials are provided.</div>`
          : null}
        ${this.status ? html`<div class="status">${this.status}</div>` : null}
      </header>

      <div class="layout">
        <aside>
          <identity-card
            .identity=${this.identity}
            @add-collaborator=${this.handleAddFriendRequest}
            @profile-updated=${this.handleProfileUpdated}
          ></identity-card>
        </aside>

        <main>
          ${this.renderMainArea()}
        </main>
      </div>

      ${this.renderFriendDialog()}
      ${this.showShareDialog && this.shareDoc
        ? html`
            <share-dialog
              .doc=${this.shareDoc}
              .collaborators=${this.collaborators}
              @share-confirmed=${this.handleShareConfirmed}
              @share-cancelled=${this.handleShareCancelled}
            ></share-dialog>
          `
        : null}
    `;
  }
}

customElements.define('collab-writer', CollabWriter);
