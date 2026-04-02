# Package Exports Field - Technical Documentation

## Issue #46078: TypeScript moduleResolution=nodenext Support

### Problem

When using Next.js with modern ES Module (ESM) setups and TypeScript's `moduleResolution: "NodeNext"`, TypeScript cannot resolve Next.js module imports:

```typescript
import Head from 'next/head' // ❌ Cannot find module 'next/head'
```

**Error:**
```
Cannot find module 'next/head' or its corresponding type declarations.
```

**Affected configurations:**
- `"type": "module"` in package.json (ESM)
- `"moduleResolution": "NodeNext"` in tsconfig.json
- Modern monorepo setups (Turborepo, pnpm workspaces)

### Root Cause

Node.js's modern module resolution (used by TypeScript's `moduleResolution: "NodeNext"`) requires an **`exports` field** in package.json to properly resolve subpath imports.

From Node.js documentation:
> "The package.json `exports` field provides an alternative to the existing `main` field for defining the entry points of a package, with the ability to define conditional exports and subpath exports."

Without an `exports` field, TypeScript cannot:
1. Resolve subpath imports (`next/head`, `next/image`, etc.)
2. Map `.js` imports to `.d.ts` type declarations
3. Support ESM-first package resolution

### Solution

Add a comprehensive `exports` field to Next.js's package.json that maps all public API entry points to their implementation files and type declarations.

#### Structure

```json
{
  "exports": {
    ".": {
      "types": "./index.d.ts",
      "default": "./dist/server/next.js"
    },
    "./head": {
      "types": "./head.d.ts",
      "default": "./head.js"
    },
    // ... (32 total exports)
  }
}
```

#### Export Conditions

Each export uses **conditional exports** with two conditions:

1. **`types`**: Path to TypeScript type declarations (`.d.ts`)
   - Resolved by TypeScript when type-checking
   - Enables proper type inference and autocomplete

2. **`default`**: Path to JavaScript implementation (`.js`)
   - Resolved at runtime by Node.js
   - Works with both CommonJS and ESM

### Coverage

The exports field covers all public Next.js APIs:

**Core Modules (24):**
- `next` - Main entry point
- `next/head`, `next/image`, `next/link`, `next/router` - Page components
- `next/navigation`, `next/headers` - App Router APIs
- `next/server`, `next/document`, `next/app` - Server-side APIs
- `next/dynamic`, `next/script`, `next/error` - Utilities
- And 12 more...

**Specialized Modules (8):**
- `next/compat/router` - Compatibility layer
- `next/legacy/image` - Legacy APIs
- `next/font/google`, `next/font/local` - Font optimization
- `next/experimental/testing/server` - Testing utilities
- `next/experimental/testmode/*` - Test mode APIs

### Compatibility

✅ **Backward compatible** - Does NOT break existing code
- CommonJS (`require('next/head')`) - Still works
- ESM with bundlers - Still works
- ESM without `type: "module"` - Still works
- TypeScript with `moduleResolution: "node"` - Still works

✅ **Enables NEW use cases**
- Modern ESM + TypeScript setups
- Monorepo with strict module resolution
- Better IDE autocomplete and type checking

### Validation

**Unit Tests:** `test/unit/package-exports.test.ts`
- Validates exports field structure
- Ensures all core modules are exported
- Verifies types/default pairs are complete

**Integration Test:** `test/integration/typescript-esm-resolution/`
- Real TypeScript compilation test
- Uses `moduleResolution: "NodeNext"` and `type: "module"`
- Imports core Next.js modules

### Implementation Notes

1. **No breaking changes** - Fully backward compatible
2. **Follows Node.js spec** - Adheres to official package exports standard
3. **TypeScript-friendly** - Separate `types` condition for optimal IDE support
4. **Future-proof** - Can add more conditions (e.g., `import`, `require`) later

### References

- **Issue:** [#46078](https://github.com/vercel/next.js/issues/46078)
- **Node.js Docs:** https://nodejs.org/api/packages.html#exports
- **TypeScript Docs:** https://www.typescriptlang.org/docs/handbook/modules/theory.html#packagejson-exports
- **Reproduction:** See `test/integration/typescript-esm-resolution/`

---

**Status:** ✅ Ready for review
**Breaking:** No
**Area:** TypeScript, ESM, Package configuration
