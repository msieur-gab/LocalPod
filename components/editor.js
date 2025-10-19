import { LitElement, html, css } from 'lit';

class DocEditor extends LitElement {
  static properties = {
    doc: { type: Object },
    collaborators: { type: Array },
    draft: { state: true },
    currentPublicKey: { type: String },
    profiles: { type: Array },
  };

  constructor() {
    super();
    this.doc = null;
    this.collaborators = [];
    this.draft = null;
    this.currentPublicKey = '';
    this.profiles = [];
  }

  static styles = css`
    .toolbar {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-bottom: 1.5rem;
    }

    .toolbar-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    input[type='text'] {
      border-radius: var(--radius-md);
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(255, 255, 255, 0.05);
      color: var(--text-primary);
      font-size: 1.15rem;
      padding: 0.85rem 1rem;
    }

    textarea {
      width: 100%;
      min-height: 420px;
      border-radius: var(--radius-md);
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(255, 255, 255, 0.04);
      color: var(--text-primary);
      padding: 1rem;
      font-family: var(--font-mono);
      font-size: 1rem;
      line-height: 1.6;
      resize: vertical;
    }

    .metadata {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      color: var(--text-muted);
      font-size: 0.85rem;
    }

    .collaborators {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .tag {
      padding: 0.4rem 0.75rem;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-muted);
      font-size: 0.8rem;
    }
  `;

  willUpdate(changedProps) {
    if (changedProps.has('doc') && this.doc) {
      this.draft = structuredClone(this.doc);
    }
  }

  updateTitle(event) {
    this.draft = { ...this.draft, title: event.target.value };
  }

  updateContent(event) {
    this.draft = { ...this.draft, content: event.target.value };
  }

  save() {
    if (!this.draft) return;
    const payload = {
      ...this.draft,
      updatedAt: new Date().toISOString(),
    };
    this.dispatchEvent(
      new CustomEvent('save-document', {
        detail: payload,
        bubbles: true,
        composed: true,
      }),
    );
  }

  share() {
    if (!this.draft) return;
    this.dispatchEvent(
      new CustomEvent('share-document', {
        detail: this.draft,
        bubbles: true,
        composed: true,
      }),
    );
  }

  goBack() {
    this.dispatchEvent(new CustomEvent('back', { bubbles: true, composed: true }));
  }

  renderCollaborators() {
    const collaboratorKeys = Array.from(new Set(this.draft?.collaborators ?? []));
    const profileMap = new Map((this.profiles ?? []).map((profile) => [profile.publicKey, profile]));

    if (collaboratorKeys.length === 0) {
      return html`<span class="tag">Private</span>`;
    }

    return collaboratorKeys.map((entry) => {
      const collaborator =
        this.collaborators.find((person) => person.publicKey === entry) ?? ({ name: null, publicKey: entry });
      const profile = profileMap.get(entry);
      let label = profile?.displayName ?? collaborator.name ?? collaborator.publicKey.slice(0, 10) + '…';
      if (this.currentPublicKey && entry === this.currentPublicKey) {
        label = 'You';
      }
      return html`<span class="tag" title=${collaborator.publicKey}>${label}</span>`;
    });
  }

  render() {
    if (!this.draft) {
      return html`<div class="card">Loading document…</div>`;
    }

    const shareCount = Array.from(new Set(this.draft.collaborators ?? [])).length;
    const shareLabel = shareCount > 0 ? `🔗 Share (${shareCount})` : '🔗 Share';

    return html`
      <div class="toolbar">
        <div class="toolbar-actions">
          <button class="secondary" @click=${this.goBack}>← Back to documents</button>
          <button class="secondary" @click=${this.share}>${shareLabel}</button>
          <button @click=${this.save}>💾 Save</button>
        </div>
        <input type="text" .value=${this.draft.title} @input=${this.updateTitle} placeholder="Document title" />
        <div class="metadata">
          <span>Last updated: ${new Date(this.draft.updatedAt ?? Date.now()).toLocaleString()}</span>
          <div class="collaborators">${this.renderCollaborators()}</div>
        </div>
      </div>

      <textarea
        .value=${this.draft.content}
        @input=${this.updateContent}
        placeholder="Start writing in Markdown…"
      ></textarea>
    `;
  }
}

customElements.define('doc-editor', DocEditor);
