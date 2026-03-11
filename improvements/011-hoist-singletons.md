# Improvement 011: Hoist Singletons and Pre-compile RegExp Patterns

## Problem

Several per-request allocations of stateless objects that should be module-scoped singletons:

### 1. `new TextEncoder()` in `api-utils/web.ts`

`byteLength()` creates a new TextEncoder on every call. Called per-request for payload size checks.

### 2. `new TextEncoder()` in `incremental-cache/index.ts`

`generateCacheKey()` creates a new TextEncoder (and TextDecoder) inside the method. The encoder is stateless and can be shared; the decoder must remain per-call because it uses streaming mode.

### 3. `new TextEncoder()` in `node-web-streams-helper.ts`

`createRuntimePrefetchTransformStream` creates its own TextEncoder despite the file already having a module-scoped `encoder` at line 34.

### 4. `new RegExp()` in `segment-explorer-path.ts`

`normalizeBoundaryFilename()` creates two RegExp objects on every call from constant strings that never change.

### 5. Redundant `new Uint8Array()` in `encryption-utils.ts`

`arrayBufferToString()` wraps the input in `new Uint8Array(buffer)` even when the input is already a Uint8Array.

## Solution

- Hoist TextEncoder instances to module scope
- Pre-compile RegExp patterns at module scope
- Skip Uint8Array wrapping when input is already Uint8Array

## Behavioral Correctness

- TextEncoder is stateless (unlike TextDecoder which is stateful when streaming) — safe to share
- RegExp patterns from constant strings produce identical results at module scope
- `buffer instanceof Uint8Array` check avoids redundant wrapping
- No change in output

## Files Changed

- `packages/next/src/server/api-utils/web.ts` — hoist TextEncoder
- `packages/next/src/server/lib/incremental-cache/index.ts` — hoist TextEncoder
- `packages/next/src/server/stream-utils/node-web-streams-helper.ts` — reuse existing module encoder
- `packages/next/src/server/app-render/segment-explorer-path.ts` — pre-compile RegExp
- `packages/next/src/server/app-render/encryption-utils.ts` — avoid redundant Uint8Array wrap
