import { LitElement, html, css } from 'lit';

const initialFormState = () => ({
  username: '',
  password: '',
  confirmPassword: '',
  mode: 'login',
  error: '',
});

class AccountGate extends LitElement {
  static properties = {
    accounts: { type: Array },
    form: { state: true },
  };

  constructor() {
    super();
    this.accounts = [];
    this.form = initialFormState();
  }

  static styles = css`
    .wrapper {
      max-width: 420px;
      margin: 4rem auto;
      padding: 2.5rem;
      border-radius: var(--radius-lg);
      background: linear-gradient(160deg, rgba(17, 28, 54, 0.85), rgba(13, 23, 43, 0.95));
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: var(--shadow-lg);
      display: grid;
      gap: 1.5rem;
    }

    h1 {
      font-size: 1.8rem;
      margin: 0;
    }

    form {
      display: grid;
      gap: 1rem;
    }

    label {
      font-size: 0.9rem;
      color: var(--text-muted);
      display: grid;
      gap: 0.5rem;
    }

    input,
    select {
      border-radius: var(--radius-sm);
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(255, 255, 255, 0.05);
      color: var(--text-primary);
      padding: 0.65rem 0.75rem;
      font-size: 1rem;
    }

    .actions {
      display: flex;
      gap: 0.75rem;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
    }

    button.secondary {
      background: rgba(255, 255, 255, 0.1);
      color: var(--text-primary);
      border: 1px solid rgba(255, 255, 255, 0.12);
    }

    .error {
      color: #ff8a80;
      font-size: 0.9rem;
    }

    .hint {
      font-size: 0.85rem;
      color: var(--text-muted);
    }
  `;

  get hasAccounts() {
    return Array.isArray(this.accounts) && this.accounts.length > 0;
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.hasAccounts) {
      this.form = { ...this.form, mode: 'login', username: this.accounts[0]?.username ?? '' };
    }
  }

  updated(changedProps) {
    if (changedProps.has('accounts')) {
      const previous = changedProps.get('accounts');
      const prevLength = Array.isArray(previous) ? previous.length : 0;
      if (this.hasAccounts && prevLength === 0) {
        this.form = { ...initialFormState(), mode: 'login', username: this.accounts[0]?.username ?? '' };
      } else if (this.hasAccounts && !this.form.username) {
        this.form = { ...this.form, username: this.accounts[0]?.username ?? '' };
      } else if (!this.hasAccounts && prevLength > 0 && this.form.mode === 'login') {
        this.form = { ...initialFormState(), mode: 'login' };
      }
    }
  }

  resetForm(partial = {}) {
    this.form = { ...initialFormState(), ...partial };
  }

  switchMode(mode) {
    this.resetForm({ mode });
  }

  handleInput(event) {
    const { name, value } = event.target;
    this.form = { ...this.form, [name]: value, error: '' };
  }

  login(event) {
    event.preventDefault();
    const { username, password } = this.form;
    if (!username || !password) {
      this.form = { ...this.form, error: 'Enter username and password.' };
      return;
    }
    this.dispatchEvent(
      new CustomEvent('unlock-account', {
        detail: { username, password },
        bubbles: true,
        composed: true,
      }),
    );
  }

  signup(event) {
    event.preventDefault();
    const { username, password, confirmPassword } = this.form;
    if (!username || !password) {
      this.form = { ...this.form, error: 'Choose a username and password.' };
      return;
    }
    if (password.length < 8) {
      this.form = { ...this.form, error: 'Password must be at least 8 characters.' };
      return;
    }
    if (password !== confirmPassword) {
      this.form = { ...this.form, error: 'Passwords do not match.' };
      return;
    }
    this.dispatchEvent(
      new CustomEvent('create-account', {
        detail: { username, password },
        bubbles: true,
        composed: true,
      }),
    );
  }

  renderLogin() {
    const hasAccounts = this.hasAccounts;
    return html`
      <form @submit=${this.login}>
        ${hasAccounts
          ? html`
              <label>
                Account
                <select name="username" .value=${this.form.username} @change=${this.handleInput} required>
                  <option value="" disabled>Select your account</option>
                  ${this.accounts.map(
                    (account) => html`<option value=${account.username}>${account.username}</option>`,
                  )}
                </select>
              </label>
            `
          : html`
              <label>
                Username
                <input
                  name="username"
                  autocomplete="username"
                  .value=${this.form.username}
                  @input=${this.handleInput}
                  required
                />
              </label>
            `}
        <label>
          Password
          <input
            type="password"
            name="password"
            autocomplete="current-password"
            .value=${this.form.password}
            @input=${this.handleInput}
            required
          />
        </label>
        ${this.form.error ? html`<p class="error">${this.form.error}</p>` : null}
        <div class="actions">
          <button type="submit">Unlock Workspace</button>
          <button class="secondary" type="button" @click=${() => this.switchMode('signup')}>
            Create new account
          </button>
        </div>
      </form>
    `;
  }

  renderSignup() {
    return html`
      <form @submit=${this.signup}>
        <label>
          Choose a username
          <input
            name="username"
            autocomplete="username"
            .value=${this.form.username}
            @input=${this.handleInput}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            name="password"
            autocomplete="new-password"
            .value=${this.form.password}
            @input=${this.handleInput}
            required
            minlength="8"
          />
        </label>
        <label>
          Confirm password
          <input
            type="password"
            name="confirmPassword"
            autocomplete="new-password"
            .value=${this.form.confirmPassword}
            @input=${this.handleInput}
            required
            minlength="8"
          />
        </label>
        <p class="hint">Your password never leaves this device. It encrypts your DID keys locally.</p>
        ${this.form.error ? html`<p class="error">${this.form.error}</p>` : null}
        <div class="actions">
          <button type="submit">Create Secure Identity</button>
          ${this.hasAccounts
            ? html`
                <button class="secondary" type="button" @click=${() => this.switchMode('login')}>Back to login</button>
              `
            : null}
        </div>
      </form>
    `;
  }

  render() {
    return html`
      <div class="wrapper">
        <div>
          <h1>Secure Collaborative Writer</h1>
          <p class="hint">
            ${this.form.mode === 'signup'
              ? 'Create a decentralized identity with a password-protected private key.'
              : this.hasAccounts
                  ? 'Unlock your encrypted workspace.'
                  : 'Enter your username and password to restore your encrypted workspace.'}
          </p>
        </div>
        ${this.form.mode === 'signup' ? this.renderSignup() : this.renderLogin()}
      </div>
    `;
  }
}

customElements.define('account-gate', AccountGate);
