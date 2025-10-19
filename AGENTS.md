# Repository Guidelines

## Project Structure & Module Organization
- `index.html` and `app.js` load the app directly in the browser—never add a build step.
- `core/crypto/`: DID, credential, and key-management modules. Keep each class self-contained and export only pure ES functions/classes.
- `core/storage/`: Filebase client, AWS signature helper, encryption utilities, and IndexedDB indexer. Store experimental scripts in `core/utils/`.
- `components/`: Lit web components grouped by domain (`identity/`, `files/`, `collaboration/`, `credentials/`). Co-locate templates, styles, and helper imports.
- `styles/`: Design tokens, resets, and main layout CSS. Extend with additional files rather than modifying the tokens directly.
- `config.example.js`: Template for secrets—copy to `config.js` (git-ignored) when running locally.

## Build, Test, and Development Commands
```bash
python -m http.server 8000     # Serve from project root
npx http-server                # Node-based alternative for Chromebook
web-test-runner --watch        # Optional component tests when installed globally
```
Open `http://localhost:8000` (or the reported port) and exercise flows in the browser console. Keep workflows zero-build and CDN-driven.

## Coding Style & Naming Conventions
- Pure ES modules with named exports; avoid default exports for clarity.
- 2-space indentation for JS, HTML, and CSS; stick to browser-native syntax.
- Lit components use `kebab-case` filenames (`did-card.js`) and register matching custom elements. Methods that touch network or crypto end with verbs (`uploadEncrypted`, `verifyCredential`).
- Use CSS custom properties from `styles/tokens.css`; prefer utility classes over inline styles.

## Testing Guidelines
- Manual browser testing is mandatory per feature: validate DID generation, encryption round-trips, and Filebase uploads (mock credentials where possible).
- Add Web Test Runner suites under `tests/` to cover component rendering, storage mocks, and crypto edge cases; name files `*.test.js`.
- Record notable manual test steps in PR descriptions so collaborators can reproduce critical flows.

## Commit & Pull Request Guidelines
- Follow Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`) and keep scope focused.
- PRs must describe the change, list manual/automated tests, and flag security-sensitive updates.
- Include screenshots or short clips when UI states change. Request review from security champions if crypto or permission logic shifts.
- Confirm GitHub Pages build by opening the preview link before requesting approval.

## Security & Configuration Tips
- Never commit `config.js`, private keys, or real Filebase buckets; rely on placeholders in examples.
- Derive secrets via Web Crypto APIs only; avoid Node-only dependencies.
- Treat modules as public: document parameters, validate inputs defensively, prefer append-only writes.
- Action item: once CLI access is available, apply a proper Filebase CORS rule (via `aws s3api put-bucket-cors`) so the bucket can remain private; current public write access is only a temporary workaround.
