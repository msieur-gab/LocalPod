import { LitElement, html, css } from 'lit';
import QrScanner from 'qr-scanner';

class AddFriendDialog extends LitElement {
  static properties = {
    pastedKey: { state: true },
    displayName: { state: true },
    isScanning: { state: true },
    error: { state: true },
  };

  constructor() {
    super();
    this.pastedKey = '';
    this.displayName = '';
    this.isScanning = false;
    this.error = '';
    this.scanner = null;
  }

  static styles = css`
    dialog {
      padding: 1.75rem 2rem;
      background: var(--surface, #0f172a);
      color: var(--text-primary, #f8fbff);
    }

    h2 {
      margin-top: 0;
      font-size: 1.4rem;
    }

    .section {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-bottom: 1.5rem;
    }

    label {
      font-size: 0.9rem;
      color: var(--text-muted);
    }

    textarea,
    input {
      width: 100%;
      border-radius: var(--radius-sm);
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(255, 255, 255, 0.04);
      color: var(--text-primary, #f8fbff);
      padding: 0.75rem;
      font-size: 0.95rem;
      resize: vertical;
      min-height: 90px;
    }

    .actions {
      display: flex;
      gap: 0.75rem;
      justify-content: flex-end;
    }

    .scanner {
      position: relative;
      width: 100%;
      min-height: 220px;
      border-radius: var(--radius-md);
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(0, 0, 0, 0.2);
    }

    .scanner video {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .error {
      color: #ff8a80;
      font-size: 0.9rem;
    }

    button.secondary {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-primary);
      border: 1px solid rgba(255, 255, 255, 0.12);
    }
  `;

  firstUpdated() {
    this.dialog = this.shadowRoot.querySelector('dialog');
    if (!this.dialog.open) {
      this.dialog.showModal();
    }
    this.videoElement = this.shadowRoot.querySelector('#qr-video');
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stopScan();
  }

  closeDialog() {
    this.stopScan();
    this.dispatchEvent(new CustomEvent('close-dialog', { bubbles: true, composed: true }));
  }

  async startScan() {
    if (this.isScanning) {
      this.stopScan();
      return;
    }

    if (!this.videoElement) return;

    try {
      this.error = '';
      this.isScanning = true;
      this.scanner = new QrScanner(
        this.videoElement,
        (result) => {
          if (result?.data) {
            this.handleKeyDetected(result.data);
          }
        },
        {
          highlightScanRegion: true,
          highlightCodeOutline: true,
        },
      );
      await this.scanner.start();
    } catch (error) {
      console.error('QR scanner failed', error);
      this.error = 'Unable to access camera. Check browser permissions.';
      this.isScanning = false;
    }
  }

  stopScan() {
    if (this.scanner) {
      this.scanner.stop();
      this.scanner.destroy();
      this.scanner = null;
    }
    this.isScanning = false;
  }

  handleKeyDetected(value) {
    if (!value) return;
    this.stopScan();
    this.emitCollaborator(value.trim());
  }

  handlePasteInput(event) {
    this.pastedKey = event.target.value;
  }

  handleNameInput(event) {
    this.displayName = event.target.value;
  }

  addFromPaste() {
    if (!this.pastedKey.trim()) {
      this.error = 'Enter a valid public key.';
      return;
    }
    this.emitCollaborator(this.pastedKey.trim());
  }

  emitCollaborator(publicKey) {
    const collaborator = {
      id: crypto.randomUUID(),
      name: this.displayName.trim() || null,
      publicKey,
      addedAt: new Date().toISOString(),
    };

    this.dispatchEvent(
      new CustomEvent('collaborator-added', {
        detail: collaborator,
        bubbles: true,
        composed: true,
      }),
    );
    this.pastedKey = '';
    this.displayName = '';
    this.closeDialog();
  }

  render() {
    return html`
      <dialog open>
        <h2>Add Collaborator</h2>

        <div class="section">
          <label>Option 1: Scan a QR code</label>
          <div class="scanner">
            <video id="qr-video" muted playsinline></video>
          </div>
          <button class="secondary" @click=${this.startScan}>${this.isScanning ? 'Stop scanning' : 'Start scanning'}</button>
        </div>

        <div class="section">
          <label>Option 2: Paste their public key</label>
          <textarea
            placeholder="did:key or base58 public key"
            .value=${this.pastedKey}
            @input=${this.handlePasteInput}
          ></textarea>
          <input
            type="text"
            placeholder="Display name (optional)"
            .value=${this.displayName}
            @input=${this.handleNameInput}
          />
          <button class="secondary" @click=${this.addFromPaste}>Add from pasted key</button>
        </div>

        ${this.error ? html`<p class="error">${this.error}</p>` : null}

        <div class="actions">
          <button class="secondary" @click=${this.closeDialog}>Cancel</button>
        </div>
      </dialog>
    `;
  }
}

customElements.define('add-friend', AddFriendDialog);
