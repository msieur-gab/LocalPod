2. Progressive Web App (PWA) (Works everywhere)

  For: Everyone else, especially mobile and Chromebook users

  Visit: https://localpod.eu
  Click: "Install LocalPod" button
  → Installs like a native app
  → Works offline
  → Uses browser storage + IPFS

  How it solves your problem:
  - ✅ Works on ALL devices (Windows, Mac, Linux, Chrome OS, Android, iOS)
  - ✅ No download/install friction (just visit URL)
  - ✅ Can work offline (Service Workers)
  - ✅ Can be decentralized (uses IPFS for storage)
  - ✅ Updates automatically

  But wait - doesn't PWA need a backend?

  No! PWA can be FULLY decentralized if you use:
  - IPFS for data storage (what you're already using)
  - Signed packages to verify code integrity
  - Distributed hosting via IPFS gateways

  ---
  Architecture That Solves EVERYTHING

  Let me show you how PWA + IPFS achieves TRUE decentralization:

  ┌─────────────────────────────────────────┐
  │  User visits: https://localpod.eth.limo │ ← IPFS gateway (distributed)
  │  Or: ipfs://QmLocalPodApp...            │ ← Direct IPFS access
  ├─────────────────────────────────────────┤
  │  PWA Code (HTML/JS/CSS)                 │
  │  Signed by developer                    │
  │  Verified by browser                    │
  └─────────────────────────────────────────┘
           ↓ Installs to device
  ┌─────────────────────────────────────────┐
  │  LocalPod PWA (Runs locally)            │
  ├─────────────────────────────────────────┤
  │  • Service Worker (offline support)     │
  │  • IndexedDB (local identity/keys)      │
  │  • Web Crypto API (signing)             │
  │  • Direct IPFS access (via js-ipfs)     │
  └─────────────────────────────────────────┘
           ↓ Stores data
  ┌─────────────────────────────────────────┐
  │  IPFS (Distributed storage)             │
  │  • No single server                     │
  │  • Censorship resistant                 │
  │  • User controls their data             │
  └─────────────────────────────────────────┘

  This is ACTUALLY decentralized!

pod-project-dev
API Key: 8c6d16691d11aba03c6a
API Secret: 582bacc450473a39252c94349a2e8aaf92ff8a3511534a032ccbf2afafccc62d
JWT: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiI5MzM3YTI4Yi0xYWFhLTQ5MTctYTVjYy04MjUwOTAxOGIwNzciLCJlbWFpbCI6ImJhdWRlLmdhYnJpZWxAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsInBpbl9wb2xpY3kiOnsicmVnaW9ucyI6W3siZGVzaXJlZFJlcGxpY2F0aW9uQ291bnQiOjEsImlkIjoiRlJBMSJ9LHsiZGVzaXJlZFJlcGxpY2F0aW9uQ291bnQiOjEsImlkIjoiTllDMSJ9XSwidmVyc2lvbiI6MX0sIm1mYV9lbmFibGVkIjpmYWxzZSwic3RhdHVzIjoiQUNUSVZFIn0sImF1dGhlbnRpY2F0aW9uVHlwZSI6InNjb3BlZEtleSIsInNjb3BlZEtleUtleSI6IjhjNmQxNjY5MWQxMWFiYTAzYzZhIiwic2NvcGVkS2V5U2VjcmV0IjoiNTgyYmFjYzQ1MDQ3M2EzOTI1MmM5NDM0OWEyZThhYWY5MmZmOGEzNTExNTM0YTAzMmNjYmYyYWZhZmNjYzYyZCIsImV4cCI6MTc5MjkxMjU4N30.CGIKPX7FbtKwx2USyyQM6xV5CNcOvfEdfj5aOBvtjvo