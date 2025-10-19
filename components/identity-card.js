import { LitElement, html, css } from 'lit';
import QRCode from 'qrcode';
import './profile-editor.js';

const shorten = (value, lead = 12, trail = 6) => {
  if (!value) return '';
  if (value.length <= lead + trail + 3) return value;
  return `${value.slice(0, lead)}…${value.slice(-trail)}`;
};

class IdentityCard extends LitElement {
  static properties = {
    identity: { type: Object },
    qrDataUrl: { state: true },
    copied: { state: true },
    showProfileEditor: { state: true },
  };

  constructor() {
    super();
    this.identity = null;
    this.qrDataUrl = '';
    this.copied = false;
    this.showProfileEditor = false;
  }

  static styles = css`
    .card {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    h2 {
      font-size: 1.35rem;
      margin: 0;
    }

    .qr-wrapper {
      width: 180px;
      height: 180px;
      display: grid;
      place-items: center;
      background: rgba(255, 255, 255, 0.04);
      border-radius: var(--radius-md);
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
    }

    .qr-wrapper img {
      width: 160px;
      height: 160px;
      image-rendering: pixelated;
    }

    .avatar {
      width: 160px;
      height: 160px;
      object-fit: cover;
      border-radius: var(--radius-md);
    }

    .key-block {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      background: rgba(255, 255, 255, 0.04);
      border-radius: var(--radius-md);
      padding: 1rem;
    }

    .key-block code {
      word-break: break-all;
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    button.secondary {
      padding-inline: 1rem;
    }

    .copied {
      color: var(--accent);
      font-size: 0.85rem;
    }
  `;

  updated(changedProps) {
    if (changedProps.has('identity') && this.identity?.publicKey) {
      this.generateQRCode();
    }
  }

  async generateQRCode() {
    try {
      this.qrDataUrl = await QRCode.toDataURL(this.identity.publicKey, {
        margin: 1,
        color: {
          dark: '#0f172a',
          light: '#f8fbff',
        },
      });
    } catch (error) {
      console.error('Failed to generate QR code', error);
      this.qrDataUrl = '';
    }
  }

  async copyKey() {
    if (!this.identity?.publicKey) return;
    try {
      await navigator.clipboard.writeText(this.identity.publicKey);
      this.copied = true;
      setTimeout(() => {
        this.copied = false;
      }, 2000);
    } catch (error) {
      console.error('Clipboard copy failed', error);
    }
  }

  requestAddCollaborator() {
    this.dispatchEvent(new CustomEvent('add-collaborator', { bubbles: true, composed: true }));
  }

  editProfile() {
    this.showProfileEditor = true;
  }

  handleProfileSaved(event) {
    const { displayName, avatar } = event.detail ?? {};
    this.showProfileEditor = false;
    this.dispatchEvent(
      new CustomEvent('profile-updated', {
        detail: { displayName, avatar },
        bubbles: true,
        composed: true,
      }),
    );
  }

  handleProfileCancelled() {
    this.showProfileEditor = false;
  }

  render() {
    if (!this.identity) {
      return html`<div class="card card--loading">Loading identity…</div>`;
    }

    return html`
      <div class="card">
        <div>
          <h2>Your Identity</h2>
          ${this.identity.displayName
            ? html`<p>Signed in as <strong>${this.identity.displayName}</strong></p>`
            : this.identity.username
            ? html`<p>Signed in as <strong>${this.identity.username}</strong></p>`
            : null}
          <p>DID: <strong>${shorten(this.identity.did, 18, 6)}</strong></p>
        </div>

        <div class="qr-wrapper">
          ${this.identity.avatar
            ? html`<img class="avatar" src=${this.identity.avatar} alt="Avatar" />`
            : this.qrDataUrl
            ? html`<img src=${this.qrDataUrl} alt="Public key QR code" />`
            : null}
        </div>

        <div class="key-block">
          <span>Public Key</span>
          <code>${this.identity.publicKey}</code>
          <button class="secondary" @click=${this.copyKey}>Copy Public Key</button>
          ${this.copied ? html`<span class="copied">Copied to clipboard</span>` : null}
        </div>

        <div class="actions">
          <button @click=${this.requestAddCollaborator}>Add Collaborator</button>
          <button class="secondary" @click=${this.editProfile}>Edit Profile</button>
        </div>
        ${this.showProfileEditor
          ? html`<profile-editor
              .displayName=${this.identity.displayName ?? this.identity.username ?? ''}
              .avatar=${this.identity.avatar ?? ''}
              .open=${this.showProfileEditor}
              @profile-saved=${this.handleProfileSaved}
              @profile-cancelled=${this.handleProfileCancelled}
            ></profile-editor>`
          : null}
      </div>
    `;
  }
}

customElements.define('identity-card', IdentityCard);
