# Next.js API Reference

**Version:** 15.4.0-canary.130  
**Repository:** https://github.com/vercel/next.js  
**Description:** The React Framework for production-ready applications with server-side rendering, static site generation, and full-stack capabilities.

## Installation

```bash
npm install next react react-dom
# or
yarn add next react react-dom
# or
pnpm add next react react-dom
```

## Core Dependencies

- **React:** ^18.2.0 || 19.0.0-rc || ^19.0.0
- **React DOM:** ^18.2.0 || 19.0.0-rc || ^19.0.0
- **PostCSS:** 8.4.31
- **Styled JSX:** 5.1.6

## CLI Commands

### Development
```bash
next dev [directory] [options]
# Options: --turbo, -p <port>, -H <hostname>, --experimental-https
```

### Build
```bash
next build [directory] [options]
# Options: --debug, --no-lint, --profile, --turbo
```

### Production
```bash
next start [directory] [options]
# Options: -p <port>, -H <hostname>, --keep-alive-timeout <ms>
```

### Linting
```bash
next lint [directory] [options]
# Options: --fix, --dir <dirs>, --file <files>, --cache
```

### System Info
```bash
next info [--verbose]
```

### Telemetry
```bash
next telemetry [enable|disable]
```


# Client-Side APIs

## Core Components

### Link Component
```typescript
import Link from 'next/link'

interface LinkProps {
  href: string | UrlObject
  as?: string | UrlObject
  replace?: boolean
  scroll?: boolean
  shallow?: boolean
  prefetch?: boolean | 'auto' | null
  locale?: string | false
  legacyBehavior?: boolean
  onNavigate?: (event: { preventDefault: () => void }) => void
}
```
Client-side navigation with automatic prefetching and optimized routing.

### Image Component
```typescript
import Image from 'next/image'

interface ImageProps {
  src: string | StaticImport
  alt: string
  width?: number
  height?: number
  fill?: boolean
  quality?: number
  priority?: boolean
  loading?: 'lazy' | 'eager'
  placeholder?: 'blur' | 'empty'
  sizes?: string
  unoptimized?: boolean
}
```
Optimized images with WebP conversion, lazy loading, and responsive sizing.

### Script Component
```typescript
import Script from 'next/script'

interface ScriptProps {
  strategy?: 'afterInteractive' | 'lazyOnload' | 'beforeInteractive' | 'worker'
  src?: string
  onLoad?: (event: Event) => void
  onReady?: () => void
  onError?: (event: Event) => void
}
```
Optimized script loading with performance-focused strategies.

### Head Component (Pages Router)
```typescript
import Head from 'next/head'

<Head>
  <title>Page Title</title>
  <meta name="description" content="Page description" />
</Head>
```
Manage document head with automatic deduplication.

### Form Component
```typescript
import Form from 'next/form'

interface FormProps {
  action?: string | ((formData: FormData) => void)
  replace?: boolean
  scroll?: boolean
  prefetch?: boolean
}
```
Enhanced forms with client-side navigation capabilities.

## Navigation Hooks (App Router)

### useRouter
```typescript
import { useRouter } from 'next/navigation'

const router = useRouter()
router.push('/dashboard')
router.replace('/login')
router.refresh()
router.back()
router.forward()
router.prefetch('/profile')
```

### usePathname
```typescript
import { usePathname } from 'next/navigation'

const pathname = usePathname() // '/dashboard'
```

### useSearchParams
```typescript
import { useSearchParams } from 'next/navigation'

const searchParams = useSearchParams()
const query = searchParams.get('q')
const hasFilter = searchParams.has('filter')
```

### useParams
```typescript
import { useParams } from 'next/navigation'

const params = useParams() // { id: '123' } for /posts/[id]
```

### useSelectedLayoutSegment
```typescript
import { useSelectedLayoutSegment } from 'next/navigation'

const segment = useSelectedLayoutSegment() // 'dashboard'
```

### useSelectedLayoutSegments
```typescript
import { useSelectedLayoutSegments } from 'next/navigation'

const segments = useSelectedLayoutSegments() // ['dashboard', 'settings']
```

## Router (Pages Router)

### useRouter (Pages)
```typescript
import { useRouter } from 'next/router'

const router = useRouter()
// Properties: pathname, route, query, asPath, locale, isReady
// Methods: push(), replace(), reload(), back(), prefetch()

router.push('/dashboard')
router.replace({ pathname: '/user', query: { id: '123' } })
router.prefetch('/profile')

// Events
router.events.on('routeChangeStart', handleRouteChange)
router.events.off('routeChangeStart', handleRouteChange)
```

## Dynamic Imports

### dynamic
```typescript
import dynamic from 'next/dynamic'

const DynamicComponent = dynamic(() => import('../components/Component'), {
  loading: () => <p>Loading...</p>,
  ssr: false
})

// With named export
const DynamicComponent = dynamic(() => import('../components/Component').then(mod => mod.ComponentName))
```

## Utility Functions

### getImageProps
```typescript
import { getImageProps } from 'next/image'

const { props } = getImageProps({ src: '/image.jpg', alt: 'Image', width: 500, height: 300 })
```


# Server-Side APIs

## Server APIs (`next/server`)

### NextRequest
```typescript
import { NextRequest } from 'next/server'

class NextRequest extends Request {
  cookies: RequestCookies
  nextUrl: NextURL
  url: string
}
```
Extended Web Request API for middleware and edge runtime.

### NextResponse
```typescript
import { NextResponse } from 'next/server'

// Create responses
NextResponse.json({ message: 'Hello' })
NextResponse.redirect('https://example.com')
NextResponse.rewrite('/internal-path')
NextResponse.next()

// Manipulate cookies
const response = NextResponse.next()
response.cookies.set('token', 'value')
response.cookies.delete('old-token')
```

### Middleware
```typescript
import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/admin')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: '/admin/:path*'
}
```

### ImageResponse
```typescript
import { ImageResponse } from 'next/server'

export async function GET() {
  return new ImageResponse(
    (
      <div style={{ display: 'flex', fontSize: 40, color: 'black', background: 'white' }}>
        Hello World
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
```

### User Agent
```typescript
import { userAgent } from 'next/server'

const { device, browser, engine, os, cpu } = userAgent({ headers: request.headers })
```

### Connection
```typescript
import { connection } from 'next/server'

const { ip, geo } = await connection()
```

## Headers API (`next/headers`)

### headers()
```typescript
import { headers } from 'next/headers'

const headersList = await headers()
const userAgent = headersList.get('user-agent')
const authorization = headersList.get('authorization')
```

### cookies()
```typescript
import { cookies } from 'next/headers'

const cookieStore = await cookies()
const token = cookieStore.get('token')
const allCookies = cookieStore.getAll()

// Set/delete cookies
cookieStore.set('name', 'value', { httpOnly: true, secure: true })
cookieStore.delete('old-cookie')
```

### draftMode()
```typescript
import { draftMode } from 'next/headers'

const { isEnabled } = await draftMode()

// Enable/disable draft mode
const draft = await draftMode()
draft.enable()
draft.disable()
```

## Cache APIs (`next/cache`)

### unstable_cache()
```typescript
import { unstable_cache } from 'next/cache'

const getCachedData = unstable_cache(
  async (id: string) => {
    return await fetchDataFromDB(id)
  },
  ['data-cache'],
  { revalidate: 3600, tags: ['data'] }
)
```

### revalidateTag()
```typescript
import { revalidateTag } from 'next/cache'

// In Server Action or Route Handler
revalidateTag('data')
```

### revalidatePath()
```typescript
import { revalidatePath } from 'next/cache'

// Revalidate specific path
revalidatePath('/dashboard')
revalidatePath('/dashboard', 'layout')
```

### unstable_noStore()
```typescript
import { unstable_noStore } from 'next/cache'

export default async function Page() {
  unstable_noStore() // Opt out of static generation
  const data = await fetch('https://api.example.com/data')
  return <div>{data}</div>
}
```

### Cache Life Profiles
```typescript
import { unstable_cacheLife } from 'next/cache'

// Predefined profiles
unstable_cacheLife('hours')
unstable_cacheLife('days')

// Custom profile
unstable_cacheLife({
  stale: 60,      // 60 seconds
  revalidate: 300, // 5 minutes
  expire: 3600    // 1 hour
})
```

## Configuration

### getConfig()
```typescript
import getConfig from 'next/config'

const { publicRuntimeConfig, serverRuntimeConfig } = getConfig()
```

## Testing

### Jest Configuration
```typescript
import nextJest from 'next/jest'

const createJestConfig = nextJest({ dir: './' })

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
}

export default createJestConfig(customJestConfig)
```

## Web Vitals

### useReportWebVitals()
```typescript
import { useReportWebVitals } from 'next/web-vitals'

export default function MyApp({ Component, pageProps }) {
  useReportWebVitals((metric) => {
    console.log(metric)
    // Send to analytics
  })
  
  return <Component {...pageProps} />
}
```


# Specialized Features

## Font Optimization

### Google Fonts
```typescript
import { Inter, Roboto, Open_Sans } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
  preload: true
})

const roboto = Roboto({
  weight: '400',
  subsets: ['latin'],
  fallback: ['Arial', 'sans-serif']
})

// Usage in components
<div className={inter.className}>Text with Inter font</div>
<div style={inter.style}>Text with Inter font</div>
```

### Local Fonts
```typescript
import localFont from 'next/font/local'

const myFont = localFont({
  src: './my-font.woff2',
  display: 'swap',
  weight: '400',
  style: 'normal'
})

// Multiple font files
const myFont = localFont({
  src: [
    { path: './my-font-regular.woff2', weight: '400', style: 'normal' },
    { path: './my-font-bold.woff2', weight: '700', style: 'normal' },
    { path: './my-font-italic.woff2', weight: '400', style: 'italic' }
  ],
  display: 'swap'
})
```

## OG Image Generation

### ImageResponse
```typescript
import { ImageResponse } from 'next/og'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const title = searchParams.get('title') || 'Default Title'

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          height: '100%',
          width: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 60,
          background: 'linear-gradient(to bottom, #dbf4ff, #fff1f1)',
          color: '#333'
        }}
      >
        {title}
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: 'Inter',
          data: await fetch(new URL('./Inter-Bold.ttf', import.meta.url)).then(res => res.arrayBuffer()),
          weight: 700
        }
      ]
    }
  )
}
```

## AMP Support

### useAmp
```typescript
import { useAmp } from 'next/amp'

export default function Page() {
  const isAmp = useAmp()
  
  return (
    <div>
      {isAmp ? <amp-img src="/amp-image.jpg" width="300" height="200" /> : <img src="/image.jpg" />}
    </div>
  )
}

// Enable AMP
export const config = { amp: true }
// Or hybrid AMP
export const config = { amp: 'hybrid' }
```

## Error Handling

### Custom Error Page
```typescript
import Error from 'next/error'

function CustomError({ statusCode, hasGetInitialPropsRun, err }) {
  return (
    <Error
      statusCode={statusCode}
      title={statusCode === 404 ? 'Page Not Found' : 'Server Error'}
    />
  )
}

CustomError.getInitialProps = ({ res, err }) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404
  return { statusCode }
}

export default CustomError
```

### Custom Document
```typescript
import Document, { Html, Head, Main, NextScript } from 'next/document'

class MyDocument extends Document {
  static async getInitialProps(ctx) {
    const initialProps = await Document.getInitialProps(ctx)
    return { ...initialProps }
  }

  render() {
    return (
      <Html lang="en">
        <Head>
          <link rel="icon" href="/favicon.ico" />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}

export default MyDocument
```

## Experimental Features

### Testing Utilities
```typescript
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'

const matches = unstable_doesMiddlewareMatch({
  config: middlewareConfig,
  url: '/api/test',
  headers: { 'user-agent': 'test' }
})
```

### Testmode Proxy
```typescript
import { createProxyServer } from 'next/experimental/testmode/proxy'

const proxyServer = createProxyServer((testData, request) => {
  if (request.url.includes('/api/mock')) {
    return new Response(JSON.stringify({ mocked: true }))
  }
  return 'continue'
})
```


# Custom Server API

## NextServer Class

```typescript
import next from 'next'

const dev = process.env.NODE_ENV !== 'production'
const hostname = 'localhost'
const port = 3000

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      await handle(req, res)
    } catch (err) {
      console.error('Error occurred handling', req.url, err)
      res.statusCode = 500
      res.end('internal server error')
    }
  })

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`)
  })
})
```

### Key Methods

```typescript
// Get request handler
const handle = app.getRequestHandler()

// Prepare the app (dev only)
await app.prepare()

// Render specific pages
await app.render(req, res, '/dashboard', query)

// Render to HTML string
const html = await app.renderToHTML(req, res, '/page', query)

// Render error pages
await app.renderError(err, req, res, '/page', query)

// Render 404
await app.render404(req, res)

// Revalidate for ISR
await app.revalidate('/page')

// Close server
await app.close()
```

# Configuration

## next.config.js

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Basic config
  reactStrictMode: true,
  swcMinify: true,
  
  // Build
  distDir: '.next',
  generateBuildId: async () => {
    return 'my-build-id'
  },
  
  // Server
  compress: true,
  poweredByHeader: false,
  generateEtags: true,
  
  // Routing
  trailingSlash: false,
  basePath: '/docs',
  assetPrefix: 'https://cdn.example.com',
  
  // Pages
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'md', 'mdx'],
  
  // Environment
  env: {
    CUSTOM_KEY: 'value'
  },
  
  // Redirects
  async redirects() {
    return [
      {
        source: '/old-path',
        destination: '/new-path',
        permanent: true
      }
    ]
  },
  
  // Rewrites
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'https://api.example.com/:path*'
      }
    ]
  },
  
  // Headers
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*'
          }
        ]
      }
    ]
  },
  
  // Images
  images: {
    domains: ['example.com'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    formats: ['image/webp'],
    minimumCacheTTL: 60,
    dangerouslyAllowSVG: false
  },
  
  // Webpack customization
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // Custom webpack config
    return config
  },
  
  // Experimental features
  experimental: {
    appDir: true,
    serverComponentsExternalPackages: ['package-name'],
    turbo: {
      rules: {
        '*.svg': {
          loaders: ['@svgr/webpack'],
          as: '*.js'
        }
      }
    }
  }
}

module.exports = nextConfig
```

# Key Constants

```typescript
// Build phases
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER,
  PHASE_EXPORT
} from 'next/constants'

// Usage in next.config.js
module.exports = (phase, { defaultConfig }) => {
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    return {
      // Development config
    }
  }
  
  if (phase === PHASE_PRODUCTION_BUILD) {
    return {
      // Build config
    }
  }
  
  return defaultConfig
}
```

# TypeScript Support

## Global Types

```typescript
// Global fetch configuration
interface RequestInit {
  next?: {
    revalidate?: number | false
    tags?: string[]
  }
}

// Environment variables
declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: 'development' | 'production' | 'test'
    NEXT_PUBLIC_API_URL: string
    DATABASE_URL: string
  }
}

// CSS Modules
declare module '*.module.css' {
  const classes: { [key: string]: string }
  export default classes
}

// Server-only and client-only modules
declare module 'server-only'
declare module 'client-only'
```

## Common Patterns

### API Routes
```typescript
// app/api/users/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  
  return NextResponse.json({ users: [] })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  
  return NextResponse.json({ success: true }, { status: 201 })
}
```

### Server Actions
```typescript
'use server'

import { revalidatePath } from 'next/cache'

export async function createUser(formData: FormData) {
  const name = formData.get('name') as string
  
  // Save to database
  await saveUser({ name })
  
  // Revalidate the page
  revalidatePath('/users')
}
```

### Metadata API
```typescript
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Page Title',
  description: 'Page description',
  openGraph: {
    title: 'OG Title',
    description: 'OG Description',
    images: ['/og-image.jpg']
  }
}

// Dynamic metadata
export async function generateMetadata({ params }): Promise<Metadata> {
  const post = await getPost(params.id)
  
  return {
    title: post.title,
    description: post.excerpt
  }
}
```

This comprehensive API reference covers all major Next.js features and APIs for building modern React applications with server-side rendering, static generation, and full-stack capabilities.

