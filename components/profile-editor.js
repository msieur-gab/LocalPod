import { LitElement, html, css } from 'lit';

export class ProfileEditor extends LitElement {
  static properties = {
    displayName: { type: String },
    avatar: { type: String },
    open: { type: Boolean },
  };

  constructor() {
    super();
    this.displayName = '';
    this.avatar = '';
    this.open = false;
  }

  static styles = css`
    dialog {
      padding: 1.75rem 2rem;
      background: var(--surface, #0f172a);
      color: var(--text-primary, #f8fbff);
      border-radius: var(--radius-md, 16px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      box-shadow: var(--shadow-lg, 0 30px 60px rgba(7, 25, 56, 0.35));
      width: min(460px, 95vw);
    }

    form {
      display: grid;
      gap: 1rem;
    }

    label {
      display: grid;
      gap: 0.5rem;
      font-size: 0.9rem;
      color: var(--text-muted, #8ca2d8);
    }

    input[type='text'] {
      border-radius: var(--radius-sm, 10px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(255, 255, 255, 0.05);
      color: var(--text-primary, #f8fbff);
      padding: 0.65rem 0.75rem;
    }

    input[type='file'] {
      color: var(--text-muted, #8ca2d8);
    }

    .preview {
      display: grid;
      gap: 0.75rem;
      align-items: center;
      justify-items: center;
      padding: 1rem;
      border-radius: var(--radius-md, 16px);
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .avatar {
      width: 140px;
      height: 140px;
      object-fit: cover;
      border-radius: var(--radius-md, 16px);
      border: 1px solid rgba(255, 255, 255, 0.12);
    }

    .actions {
      display: flex;
      gap: 0.75rem;
      justify-content: flex-end;
    }

    .hint {
      font-size: 0.8rem;
      color: var(--text-muted, #8ca2d8);
    }

    button.secondary {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-primary, #f8fbff);
      border: 1px solid rgba(255, 255, 255, 0.12);
    }
  `;

  firstUpdated() {
    this.dialog = this.shadowRoot.querySelector('dialog');
    if (this.open && !this.dialog.open) {
      this.dialog.showModal();
    }
  }

  updated(changedProps) {
    if (changedProps.has('open') && this.dialog) {
      if (this.open && !this.dialog.open) {
        this.dialog.showModal();
      } else if (!this.open && this.dialog.open) {
        this.dialog.close();
      }
    }
  }

  handleNameInput(event) {
    this.displayName = event.target.value;
  }

  handleFileInput(event) {
    const file = event.target.files?.[0];
    if (!file) {
      this.avatar = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      this.avatar = reader.result;
    };
    reader.readAsDataURL(file);
  }

  removeAvatar() {
    this.avatar = '';
    const fileInput = this.shadowRoot.querySelector('input[type="file"]');
    if (fileInput) {
      fileInput.value = '';
    }
  }

  saveProfile(event) {
    event.preventDefault();
    this.dispatchEvent(
      new CustomEvent('profile-saved', {
        detail: {
          displayName: this.displayName.trim(),
          avatar: this.avatar,
        },
        bubbles: true,
        composed: true,
      }),
    );
    this.dialog.close();
  }

  cancel() {
    this.dispatchEvent(new CustomEvent('profile-cancelled', { bubbles: true, composed: true }));
    this.dialog.close();
  }

  render() {
    return html`
      <dialog>
        <form @submit=${this.saveProfile}>
          <h2>Edit Profile</h2>
          <label>
            Display name
            <input type="text" .value=${this.displayName} @input=${this.handleNameInput} placeholder="e.g. Alice" />
          </label>

          <label>
            Avatar
            <input type="file" accept="image/*" @change=${this.handleFileInput} />
            <span class="hint">Upload a square image. It will be stored as base64.</span>
          </label>

          ${this.avatar
            ? html`
                <div class="preview">
                  <img class="avatar" src=${this.avatar} alt="Avatar preview" />
                  <button type="button" class="secondary" @click=${this.removeAvatar}>Remove avatar</button>
                </div>
              `
            : null}

          <div class="actions">
            <button type="button" class="secondary" @click=${this.cancel}>Cancel</button>
            <button type="submit">Save</button>
          </div>
        </form>
      </dialog>
    `;
  }
}

customElements.define('profile-editor', ProfileEditor);
