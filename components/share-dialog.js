import { LitElement, html, css } from 'lit';

class ShareDialog extends LitElement {
  static properties = {
    collaborators: { type: Array },
    selected: { state: true },
    doc: { type: Object },
  };

  constructor() {
    super();
    this.collaborators = [];
    this.selected = new Set();
    this.doc = { collaborators: [] };
  }

  static styles = css`
    dialog {
      padding: 1.75rem 2rem;
      background: var(--surface, #0f172a);
      color: var(--text-primary, #f8fbff);
      border-radius: var(--radius-md, 16px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      box-shadow: var(--shadow-lg, 0 30px 60px rgba(7, 25, 56, 0.35));
      width: min(420px, 92vw);
    }

    h2 {
      margin: 0 0 1rem 0;
      font-size: 1.35rem;
    }

    .list {
      display: grid;
      gap: 0.75rem;
      margin: 1rem 0 1.5rem;
    }

    label {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.65rem 0.75rem;
      background: rgba(255, 255, 255, 0.04);
      border-radius: var(--radius-sm, 10px);
      cursor: pointer;
      border: 1px solid rgba(255, 255, 255, 0.08);
      transition: border 120ms ease;
    }

    label:hover {
      border-color: rgba(255, 255, 255, 0.22);
    }

    input[type='checkbox'] {
      accent-color: var(--accent, #38bdf8);
      width: 18px;
      height: 18px;
    }

    .hint {
      font-size: 0.75rem;
      color: var(--text-muted, #8ca2d8);
      word-break: break-all;
    }

    .empty {
      font-size: 0.9rem;
      color: var(--text-muted, #8ca2d8);
    }

    .hint-global {
      font-size: 0.85rem;
      color: var(--text-muted, #8ca2d8);
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    button.secondary {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-primary, #f8fbff);
      border: 1px solid rgba(255, 255, 255, 0.12);
    }
  `;

  firstUpdated() {
    this.dialog = this.shadowRoot.querySelector('dialog');
    if (!this.dialog.open) {
      this.dialog.showModal();
    }
    this.resetSelection();
  }

  updated(changedProps) {
    if (changedProps.has('doc')) {
      this.resetSelection();
    }
  }

  resetSelection() {
    const current = new Set(this.doc?.collaborators ?? []);
    this.selected = current;
  }

  toggleCollaborator(publicKey) {
    const next = new Set(this.selected);
    if (next.has(publicKey)) {
      next.delete(publicKey);
    } else {
      next.add(publicKey);
    }
    this.selected = next;
  }

  confirm() {
    this.close();
    this.dispatchEvent(
      new CustomEvent('share-confirmed', {
        detail: {
          docId: this.doc?.id,
          collaborators: Array.from(this.selected),
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  close() {
    if (this.dialog) {
      this.dialog.close();
    }
    this.dispatchEvent(new CustomEvent('share-cancelled', { bubbles: true, composed: true }));
  }

  renderCollaboratorOption(entry) {
    return html`
      <label>
        <input
          type="checkbox"
          .checked=${this.selected.has(entry.publicKey)}
          @change=${() => this.toggleCollaborator(entry.publicKey)}
        />
        <div>
          <strong>${entry.name ?? entry.publicKey.slice(0, 10) + '…'}</strong>
          <div class="hint">${entry.publicKey}</div>
        </div>
      </label>
    `;
  }

  render() {
    return html`
      <dialog open>
        <h2>Share Document</h2>
        ${this.collaborators.length
          ? html`<div class="list">${this.collaborators.map((entry) => this.renderCollaboratorOption(entry))}</div>`
          : html`<p class="empty">Add collaborators first before sharing documents.</p>`}
        <p class="hint-global">You always retain access. Selecting collaborators grants them decryption keys.</p>

        <div class="actions">
          <button class="secondary" type="button" @click=${this.close}>Cancel</button>
          <button type="button" @click=${this.confirm}>Share</button>
        </div>
      </dialog>
    `;
  }
}

customElements.define('share-dialog', ShareDialog);
