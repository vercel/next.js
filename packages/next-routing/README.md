# @next/routing

Shared route resolving package for Next.js.

**NOTE: This package is experimental and will become stable along with adapters API**

## Overview

This package provides a comprehensive route resolution system that handles rewrites, redirects, middleware invocation, and dynamic route matching with support for conditional routing based on headers, cookies, queries, and host.

## Installation

```bash
npm install @next/routing
```

## Usage

```typescript
import { resolveRoutes } from '@next/routing'

const result = await resolveRoutes({
  url: new URL('https://example.com/api/users'),
  basePath: '',
  requestBody: readableStream,
  headers: new Headers(),
  pathnames: ['/api/users', '/api/posts'],
  routes: {
    beforeMiddleware: [],
    beforeFiles: [],
    afterFiles: [],
    dynamicRoutes: [],
    onMatch: [],
    fallback: [],
  },
  invokeMiddleware: async (ctx) => {
    // Your middleware logic
    return {}
  },
})

if (result.matchedPathname) {
  console.log('Matched:', result.matchedPathname)
}
```

## Route Resolution Flow

1. **beforeMiddleware routes** - Applied before middleware execution
2. **invokeMiddleware** - Custom middleware logic
3. **beforeFiles routes** - Applied before checking filesystem
4. **Static pathname matching** - Check against provided pathnames
5. **afterFiles routes** - Applied after filesystem checks
6. **dynamicRoutes** - Dynamic route matching with parameter extraction
7. **fallback routes** - Final fallback routes

## Route Configuration

Each route can have:

- `sourceRegex` - Regular expression to match against pathname
- `destination` - Destination path with support for replacements ($1, $name)
- `headers` - Headers to apply on match
- `has` - Conditions that must match
- `missing` - Conditions that must not match
- `status` - HTTP status code (3xx for redirects)

### Redirects

When a route has:
- A redirect status code (300-399)
- Headers containing `Location` or `Refresh`

The routing will end immediately and return a `redirect` result with the destination URL and status code.

### Has/Missing Conditions

Conditions support:

- `header` - Match HTTP headers
- `cookie` - Match cookies
- `query` - Match query parameters
- `host` - Match hostname

Values can be:

- `undefined` - Match if key exists
- String - Direct string match
- Regex string - Match against regex pattern
