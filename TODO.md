# TODO / Roadmap

Authoritative list of outstanding work items for the Identity Platform SDK.

## Testing & Quality

- [ ] Add automated unit / integration tests for core services (AccountService, ProfileService, CollaboratorService, crypto helpers).
- [ ] Set up CI (lint + test) so PRs and releases are automatically validated.

## Platform & UX

- [ ] Build Lit web components (e.g., account-gate, identity-card) for easier app integration.
- [ ] Implement TypeScript type definitions for public SDK APIs.
- [ ] Add conflict-resolution strategy for profile updates arriving from multiple devices.
- [ ] Design and implement an account recovery flow.
- [ ] Support multi-device sync with proper key management.

## Remote Storage & Sync

- [ ] Remote storage sync service (background job / scheduler) to keep local and remote data aligned.
- [ ] Harden cloud sync paths: add retry/backoff, monitoring/logging, and health checks around remote uploads/downloads.
- [ ] Move `config.js` secrets into Netlify environment variables (keep `config.example.js` as developer reference, load real values at runtime).
- [ ] Evaluate Pinata as an alternative to Filebase: replace the S3 signer with Pinata REST calls, handle pin/unpin lifecycle, and persist CID metadata for “latest version” lookups.

## Authentication & Security

- [ ] Implement server-verified passkey authentication (current browser-only flow is experimental). Plan: Netlify Function using `@simplewebauthn/server` to issue/verify WebAuthn challenges and store credential public keys + counters in Netlify KV/Blobs.
- [ ] Add server-side rate limiting / throttling for authentication endpoints once they exist.

