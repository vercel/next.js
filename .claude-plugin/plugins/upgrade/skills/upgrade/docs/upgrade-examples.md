# Next.js Upgrade Examples and Procedures

This document contains detailed examples and procedures for upgrading Next.js applications. For the latest breaking changes and requirements, always refer to the [official upgrade guide](https://nextjs.org/docs/app/building-your-application/upgrading).

## Upgrade Workflow Examples

### Sequential Upgrade Example: 13 → 16

Never skip versions. Always upgrade sequentially:

```bash
# Step 1: Check current version
cat package.json | grep '"next"'

# Step 2: Upgrade 13 → 14
npx @next/codemod@canary upgrade 14
npm run build  # Verify build
npm run dev    # Test locally

# Step 3: Upgrade 14 → 15
npx @next/codemod@canary upgrade 15
npm run build  # Verify build
npm run dev    # Test locally

# Step 4: Upgrade 15 → 16
npx @next/codemod@canary upgrade 16
npm run build  # Verify build
npm run dev    # Test locally
```

### Finding and Fixing Codemod Errors

After each upgrade, search for incomplete transformations:

```bash
# Find all locations needing manual fixes
grep -rn "@next-codemod-error" \
  --include="*.ts" \
  --include="*.tsx" \
  --include="*.js" \
  --include="*.jsx" \
  --include="*.mjs" .
```

## Common Migration Examples

### Example 1: Async Request APIs (v14 → v15)

The codemod will transform most cases, but here are examples of manual fixes:

**Before (v14):**
```tsx
// app/products/[id]/page.tsx
export default function ProductPage({ params, searchParams }) {
  const productId = params.id;
  const filter = searchParams.filter;

  return <ProductDetails id={productId} filter={filter} />;
}
```

**After (v15):**
```tsx
// app/products/[id]/page.tsx
export default async function ProductPage({ params, searchParams }) {
  const { id: productId } = await params;
  const { filter } = await searchParams;

  return <ProductDetails id={productId} filter={filter} />;
}
```

**Server Component with cookies:**
```tsx
// Before (v14)
import { cookies } from 'next/headers';

export default function UserProfile() {
  const cookieStore = cookies();
  const token = cookieStore.get('token');

  return <div>Token: {token?.value}</div>;
}

// After (v15)
import { cookies } from 'next/headers';

export default async function UserProfile() {
  const cookieStore = await cookies();
  const token = cookieStore.get('token');

  return <div>Token: {token?.value}</div>;
}
```

### Example 2: Middleware to Proxy Migration (v15 → v16)

**Before (v15):**
```ts
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set('x-custom-header', 'value');
  return response;
}

export const config = {
  matcher: '/api/:path*',
};
```

**After (v16):**
```ts
// proxy.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set('x-custom-header', 'value');
  return response;
}

export const config = {
  matcher: '/api/:path*',
};
```

### Example 3: Fetch Caching Changes (v14 → v15)

**Before (v14 - cached by default):**
```tsx
async function getData() {
  // This was cached by default in v14
  const res = await fetch('https://api.example.com/data');
  return res.json();
}
```

**After (v15 - not cached by default):**
```tsx
async function getData() {
  // Must explicitly opt into caching in v15+
  const res = await fetch('https://api.example.com/data', {
    cache: 'force-cache'  // or use next: { revalidate: 3600 }
  });
  return res.json();
}

// Or set default behavior for the route segment:
export const fetchCache = 'default-cache';
```

### Example 4: next export Removal (v13 → v14)

**Before (v13):**
```json
// package.json
{
  "scripts": {
    "build": "next build",
    "export": "next export"
  }
}
```

**After (v14):**
```js
// next.config.js
module.exports = {
  output: 'export',
  // ... other config
}
```

```json
// package.json
{
  "scripts": {
    "build": "next build"  // export happens during build
  }
}
```

## Troubleshooting Procedures

### Procedure: Module Resolution Errors

When encountering "Cannot find module" errors after upgrade:

```bash
# 1. Clean all caches and dependencies
rm -rf node_modules .next package-lock.json

# 2. Clear npm cache
npm cache clean --force

# 3. Reinstall dependencies
npm install

# 4. Rebuild
npm run build
```

### Procedure: TypeScript Errors After Upgrade

```bash
# 1. Update TypeScript definitions
npm i -D @types/react@latest @types/react-dom@latest

# 2. For Next.js 16+, regenerate types
npx next typegen

# 3. Clear TypeScript cache
rm -rf tsconfig.tsbuildinfo

# 4. Rebuild
npm run build
```

### Procedure: Verifying Node.js Version

```bash
# Check current version
node --version

# Version requirements:
# Next.js 14: Node.js 18.17.0+
# Next.js 15: Node.js 18.17.0+
# Next.js 16: Node.js 20.9.0+

# Using nvm to switch versions
nvm install 20
nvm use 20
```

## Testing Checklist

After each major version upgrade:

```bash
# 1. Build test
npm run build

# 2. Development server test
npm run dev
# - Navigate to main pages
# - Test interactive features
# - Check browser console for errors

# 3. Production build test
npm run build && npm run start

# 4. Type checking (if using TypeScript)
npm run type-check  # or tsc --noEmit

# 5. Linting
npm run lint

# 6. Run tests (if available)
npm test
```

## Parallel Routes Default File (v16)

In Next.js 16, parallel routes require explicit `default.tsx` files:

```tsx
// app/@modal/default.tsx
export default function Default() {
  return null;
}

// app/@sidebar/default.tsx
export default function Default() {
  return null;
}
```

## Edge Cases and Manual Fixes

### Dynamic Import with Cookies

When dynamically importing components that use cookies:

```tsx
// May need manual adjustment
const DynamicComponent = dynamic(
  () => import('./component-using-cookies'),
  {
    ssr: true,
    // Ensure the parent is async if the child uses cookies
  }
);
```

### Custom Server Configurations

Custom servers may need additional updates not covered by codemods:

```js
// Check for deprecated APIs in custom server files
// server.js, server.ts, etc.
```

## References

- [Official Upgrade Guide](https://nextjs.org/docs/app/building-your-application/upgrading)
- [Codemods Documentation](https://nextjs.org/docs/app/building-your-application/upgrading/codemods)
- [Version History](https://nextjs.org/docs/app/building-your-application/upgrading/version-history)