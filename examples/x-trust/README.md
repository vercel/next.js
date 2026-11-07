# X-Trust + Next.js

Human presence attestation for Next.js API routes.
Zero KYC, Zero PII. Annotate, never block.

## How it works

The middleware verifies the `X-Trust` header on every `/api/*` request.
Each request is annotated with a human score (0..1) — never blocked.

## Setup

1. Install: `npm install @htl-syterme/htl-core`
2. Set `HTL_SECRET` in `.env.local`
3. The middleware annotates every request automatically

## Links

- OSS: https://github.com/htl-syterme/htl-core
- JSR: https://jsr.io/@htl-syterme/htl-core
- Live demo: https://htl-syterme.github.io/htl-core
