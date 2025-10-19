import { LitElement, html, css } from 'lit';

class DocumentList extends LitElement {
  static properties = {
    documents: { type: Array },
  };

  constructor() {
    super();
    this.documents = [];
  }

  static styles = css`
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .grid {
      display: grid;
      gap: 1rem;
    }

    .card {
      background: rgba(255, 255, 255, 0.04);
      border-radius: var(--radius-md);
      border: 1px solid rgba(255, 255, 255, 0.06);
      padding: 1.25rem;
      cursor: pointer;
      transition: transform 120ms ease, border-color 120ms ease;
    }

    .card:hover {
      transform: translateY(-2px);
      border-color: rgba(255, 255, 255, 0.16);
    }

    .card h3 {
      margin: 0 0 0.5rem 0;
      font-size: 1.15rem;
    }

    .card p {
      margin: 0;
      color: var(--text-muted);
      font-size: 0.9rem;
    }

    .empty {
      border-radius: var(--radius-md);
      border: 1px dashed rgba(255, 255, 255, 0.16);
      padding: 2rem;
      text-align: center;
      color: var(--text-muted);
    }
  `;

  handleNewDocument() {
    this.dispatchEvent(new CustomEvent('new-document', { bubbles: true, composed: true }));
  }

  openDocument(doc) {
    this.dispatchEvent(
      new CustomEvent('open-document', {
        detail: { id: doc.id },
        bubbles: true,
        composed: true,
      }),
    );
  }

  renderDocument(doc) {
    const collaboratorCount = doc.collaboratorCount ?? new Set(doc.collaborators ?? []).size;
    let shareLabel = 'Private';

    if (doc.accessLevel === 'collaborator') {
      shareLabel = 'Shared with you';
    } else if (doc.accessLevel === 'owner') {
      shareLabel =
        collaboratorCount > 0
          ? `Shared with ${collaboratorCount} ${collaboratorCount === 1 ? 'collaborator' : 'collaborators'}`
          : 'Private';
    } else if (doc.accessLevel === 'legacy') {
      shareLabel = 'Legacy document (re-save to secure)';
    }

    const ownerLabel = doc.ownerDisplayName ?? doc.ownerPublicKey?.slice(0, 10)?.concat('…') ?? 'Unknown owner';

    return html`
      <article class="card" @click=${() => this.openDocument(doc)}>
        <h3>${doc.title}</h3>
        <p>${doc.preview ?? (doc.content ? doc.content.slice(0, 140) + '…' : 'No content yet')}</p>
        <p><small>Owner: ${ownerLabel}</small></p>
        <p><small>${shareLabel}</small></p>
        <p><small>Updated: ${new Date(doc.updatedAt ?? Date.now()).toLocaleString()}</small></p>
      </article>
    `;
  }

  render() {
    return html`
      <div class="header">
        <div>
          <h2>Documents</h2>
          <p>Encrypted markdown files pinned to IPFS/Filebase.</p>
        </div>
        <button @click=${this.handleNewDocument}>+ New Document</button>
      </div>

      ${this.documents.length
        ? html`<div class="grid">${this.documents.map((doc) => this.renderDocument(doc))}</div>`
        : html`<div class="empty">
            <p>No documents yet.</p>
            <p>Start by creating a new encrypted document.</p>
          </div>`}
    `;
  }
}

customElements.define('doc-list', DocumentList);
