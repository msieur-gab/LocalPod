/**
 * Collaborator Scanner Component
 *
 * A reusable Lit web component for scanning QR codes to add collaborators.
 * Supports camera scanning, file upload, and manual JSON paste.
 *
 * Usage:
 * ```html
 * <collaborator-scanner></collaborator-scanner>
 * ```
 *
 * Events:
 * - collaborator-scanned: Fired when valid collaborator data is found
 *   detail: { did, publicKey, encryptionPublicKey, username }
 * - scan-error: Fired when scanning fails
 *   detail: { error: string }
 * - scan-cancelled: Fired when user cancels scanning
 *
 * @example
 * ```javascript
 * const scanner = document.querySelector('collaborator-scanner');
 * scanner.addEventListener('collaborator-scanned', (e) => {
 *   console.log('Scanned collaborator:', e.detail);
 *   await platform.addCollaborator(e.detail);
 * });
 * ```
 */

import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import jsQR from 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/+esm';

export class CollaboratorScanner extends LitElement {
  static properties = {
    mode: { type: String }, // 'camera', 'file', 'paste', 'closed'
    scanning: { type: Boolean },
    error: { type: String },
    cameraPermission: { type: String }, // 'prompt', 'granted', 'denied'
  };

  static styles = css`
    :host {
      display: block;
      font-family: system-ui, -apple-system, sans-serif;
    }

    .scanner-container {
      border: 2px solid #e5e7eb;
      border-radius: 12px;
      padding: 1.5rem;
      background: white;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }

    .scanner-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .scanner-header h3 {
      margin: 0;
      font-size: 1.25rem;
      color: #111827;
    }

    .close-btn {
      background: none;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      color: #6b7280;
      padding: 0.25rem;
      line-height: 1;
    }

    .close-btn:hover {
      color: #111827;
    }

    .mode-selector {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.5rem;
      margin-bottom: 1.5rem;
    }

    .mode-btn {
      padding: 0.75rem 1rem;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      background: white;
      cursor: pointer;
      font-size: 0.875rem;
      font-weight: 500;
      color: #6b7280;
      transition: all 0.2s;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.25rem;
    }

    .mode-btn:hover {
      border-color: #d1d5db;
      background: #f9fafb;
    }

    .mode-btn.active {
      border-color: #3b82f6;
      background: #eff6ff;
      color: #3b82f6;
    }

    .mode-btn .icon {
      font-size: 1.5rem;
    }

    .scanner-content {
      min-height: 200px;
    }

    .camera-view {
      position: relative;
      width: 100%;
      background: #000;
      border-radius: 8px;
      overflow: hidden;
    }

    .camera-view video {
      width: 100%;
      height: auto;
      display: block;
    }

    .camera-view canvas {
      display: none;
    }

    .scanning-overlay {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 200px;
      height: 200px;
      border: 2px solid #3b82f6;
      border-radius: 8px;
      box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
    }

    .scanning-overlay::before,
    .scanning-overlay::after {
      content: '';
      position: absolute;
      width: 20px;
      height: 20px;
      border: 3px solid #3b82f6;
    }

    .scanning-overlay::before {
      top: -2px;
      left: -2px;
      border-right: none;
      border-bottom: none;
    }

    .scanning-overlay::after {
      bottom: -2px;
      right: -2px;
      border-left: none;
      border-top: none;
    }

    .file-upload-area {
      border: 2px dashed #d1d5db;
      border-radius: 8px;
      padding: 2rem;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
    }

    .file-upload-area:hover {
      border-color: #3b82f6;
      background: #f9fafb;
    }

    .file-upload-area.drag-over {
      border-color: #3b82f6;
      background: #eff6ff;
    }

    .file-upload-area .icon {
      font-size: 3rem;
      color: #9ca3af;
      margin-bottom: 0.5rem;
    }

    .file-upload-area input {
      display: none;
    }

    .paste-area {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .paste-area label {
      font-weight: 500;
      color: #374151;
      font-size: 0.875rem;
    }

    .paste-area textarea {
      width: 100%;
      min-height: 150px;
      padding: 0.75rem;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 0.875rem;
      resize: vertical;
    }

    .paste-area textarea:focus {
      outline: none;
      border-color: #3b82f6;
    }

    .paste-area button {
      padding: 0.75rem 1.5rem;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 8px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    }

    .paste-area button:hover {
      background: #2563eb;
    }

    .paste-area button:disabled {
      background: #9ca3af;
      cursor: not-allowed;
    }

    .error-message {
      margin-top: 1rem;
      padding: 0.75rem;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      color: #991b1b;
      font-size: 0.875rem;
    }

    .info-message {
      margin-top: 1rem;
      padding: 0.75rem;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 8px;
      color: #1e40af;
      font-size: 0.875rem;
    }

    .scanning-status {
      text-align: center;
      color: #6b7280;
      padding: 1rem;
      font-size: 0.875rem;
    }

    .scanning-status .spinner {
      display: inline-block;
      width: 20px;
      height: 20px;
      border: 3px solid #e5e7eb;
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-right: 0.5rem;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .permission-prompt {
      text-align: center;
      padding: 2rem;
    }

    .permission-prompt .icon {
      font-size: 3rem;
      margin-bottom: 1rem;
    }

    .permission-prompt button {
      padding: 0.75rem 1.5rem;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 8px;
      font-weight: 500;
      cursor: pointer;
      margin-top: 1rem;
    }

    .permission-prompt button:hover {
      background: #2563eb;
    }
  `;

  constructor() {
    super();
    this.mode = 'closed';
    this.scanning = false;
    this.error = '';
    this.cameraPermission = 'prompt';
    this.videoStream = null;
    this.scanningInterval = null;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stopCamera();
  }

  open(mode = 'camera') {
    this.mode = mode;
    this.error = '';
    if (mode === 'camera') {
      this.requestCameraPermission();
    }
  }

  close() {
    this.mode = 'closed';
    this.stopCamera();
    this.dispatchEvent(new CustomEvent('scan-cancelled'));
  }

  async requestCameraPermission() {
    try {
      this.cameraPermission = 'requesting';
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      this.cameraPermission = 'granted';
      this.startCamera(stream);
    } catch (err) {
      this.cameraPermission = 'denied';
      this.error = 'Camera access denied. Please allow camera access or use file upload.';
    }
  }

  startCamera(stream) {
    this.videoStream = stream;
    this.scanning = true;

    this.updateComplete.then(() => {
      const video = this.shadowRoot.querySelector('video');
      if (video) {
        video.srcObject = stream;
        video.play();
        this.startScanning(video);
      }
    });
  }

  stopCamera() {
    if (this.videoStream) {
      this.videoStream.getTracks().forEach(track => track.stop());
      this.videoStream = null;
    }
    if (this.scanningInterval) {
      clearInterval(this.scanningInterval);
      this.scanningInterval = null;
    }
    this.scanning = false;
  }

  startScanning(video) {
    const canvas = this.shadowRoot.querySelector('canvas');
    const ctx = canvas.getContext('2d');

    this.scanningInterval = setInterval(() => {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);

        if (code) {
          this.handleQRCode(code.data);
        }
      }
    }, 300); // Scan every 300ms
  }

  async handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const imageData = await this.readImageFile(file);
      const code = jsQR(imageData.data, imageData.width, imageData.height);

      if (code) {
        this.handleQRCode(code.data);
      } else {
        this.error = 'No QR code found in image. Please try again.';
      }
    } catch (err) {
      this.error = 'Failed to read image file.';
    }
  }

  readImageFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          resolve(imageData);
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  handleManualPaste() {
    const textarea = this.shadowRoot.querySelector('textarea');
    const jsonText = textarea.value.trim();

    if (!jsonText) {
      this.error = 'Please paste JSON data.';
      return;
    }

    this.handleQRCode(jsonText);
  }

  handleQRCode(data) {
    try {
      const collaborator = this.parseCollaboratorData(data);

      // Stop scanning
      this.stopCamera();

      // Emit success event
      this.dispatchEvent(new CustomEvent('collaborator-scanned', {
        detail: collaborator,
        bubbles: true,
        composed: true
      }));

      // Close scanner
      this.close();

    } catch (err) {
      this.error = err.message;
      this.dispatchEvent(new CustomEvent('scan-error', {
        detail: { error: err.message },
        bubbles: true,
        composed: true
      }));
    }
  }

  parseCollaboratorData(data) {
    try {
      const parsed = JSON.parse(data);

      // Validate required fields
      if (!parsed.publicKey) {
        throw new Error('Missing required field: publicKey');
      }

      if (!parsed.did) {
        throw new Error('Missing required field: did');
      }

      // Handle encryptionPublicKey null case
      // If null, we'll generate one or warn the user
      const encryptionPublicKey = parsed.encryptionPublicKey || null;

      if (!encryptionPublicKey) {
        console.warn('⚠️ Collaborator has no encryptionPublicKey - encrypted collaboration may not be possible');
      }

      return {
        did: parsed.did,
        publicKey: parsed.publicKey,
        encryptionPublicKey,
        username: parsed.username || null,
        name: parsed.name || parsed.username || null
      };

    } catch (err) {
      throw new Error(`Invalid collaborator data: ${err.message}`);
    }
  }

  render() {
    if (this.mode === 'closed') {
      return html``;
    }

    return html`
      <div class="scanner-container">
        <div class="scanner-header">
          <h3>📷 Scan Collaborator</h3>
          <button class="close-btn" @click=${this.close}>×</button>
        </div>

        <div class="mode-selector">
          <button
            class="mode-btn ${this.mode === 'camera' ? 'active' : ''}"
            @click=${() => this.open('camera')}
          >
            <span class="icon">📸</span>
            <span>Camera</span>
          </button>
          <button
            class="mode-btn ${this.mode === 'file' ? 'active' : ''}"
            @click=${() => this.open('file')}
          >
            <span class="icon">🖼️</span>
            <span>Upload</span>
          </button>
          <button
            class="mode-btn ${this.mode === 'paste' ? 'active' : ''}"
            @click=${() => this.open('paste')}
          >
            <span class="icon">📋</span>
            <span>Paste</span>
          </button>
        </div>

        <div class="scanner-content">
          ${this.renderContent()}
        </div>

        ${this.error ? html`
          <div class="error-message">
            ⚠️ ${this.error}
          </div>
        ` : ''}
      </div>
    `;
  }

  renderContent() {
    if (this.mode === 'camera') {
      if (this.cameraPermission === 'denied') {
        return html`
          <div class="permission-prompt">
            <div class="icon">📷🚫</div>
            <p>Camera access was denied.</p>
            <p>Please enable camera permissions in your browser settings or use file upload.</p>
            <button @click=${() => this.open('file')}>
              Upload QR Image Instead
            </button>
          </div>
        `;
      }

      if (this.cameraPermission === 'requesting') {
        return html`
          <div class="permission-prompt">
            <div class="icon">📷</div>
            <p>Requesting camera permission...</p>
          </div>
        `;
      }

      if (this.scanning) {
        return html`
          <div class="camera-view">
            <video autoplay playsinline></video>
            <canvas></canvas>
            <div class="scanning-overlay"></div>
          </div>
          <div class="scanning-status">
            <span class="spinner"></span>
            Point camera at QR code...
          </div>
        `;
      }

      return html`
        <div class="permission-prompt">
          <div class="icon">📷</div>
          <p>Allow camera access to scan QR codes</p>
          <button @click=${this.requestCameraPermission}>
            Enable Camera
          </button>
        </div>
      `;
    }

    if (this.mode === 'file') {
      return html`
        <label class="file-upload-area">
          <div class="icon">🖼️</div>
          <p><strong>Click to upload</strong> or drag and drop</p>
          <p style="font-size: 0.875rem; color: #6b7280; margin-top: 0.5rem;">
            PNG, JPG, or any image containing a QR code
          </p>
          <input
            type="file"
            accept="image/*"
            @change=${this.handleFileUpload}
          />
        </label>
      `;
    }

    if (this.mode === 'paste') {
      return html`
        <div class="paste-area">
          <label>Paste Collaborator JSON:</label>
          <textarea
            placeholder='{"did":"did:key:z...","publicKey":"...","encryptionPublicKey":"...","username":"alice"}'
          ></textarea>
          <button @click=${this.handleManualPaste}>
            Parse JSON
          </button>
          <div class="info-message">
            💡 Paste the JSON from "Copy Collaboration Share" button
          </div>
        </div>
      `;
    }
  }
}

customElements.define('collaborator-scanner', CollaboratorScanner);
