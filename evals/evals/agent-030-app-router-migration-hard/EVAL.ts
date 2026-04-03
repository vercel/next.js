/**
 * App Router Migration (Hard)
 *
 * Tests a comprehensive Pages-to-App Router migration including data fetching
 * (getServerSideProps/getStaticProps), dynamic routes, API routes, custom
 * _app/_document, metadata, and client/server component separation.
 *
 * Tricky because it requires migrating multiple advanced patterns at once:
 * data fetching, route handlers, metadata API, and proper 'use client'
 * directive placement — all while maintaining functionality.
 */

import { expect, test } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

/** Strip JS/TS comments so we only test actual code, not migration notes */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

test('Root layout exists and replaces _app/_document', () => {
  const layoutPath = join(process.cwd(), 'app', 'layout.tsx')
  expect(existsSync(layoutPath)).toBe(true)

  const layoutContent = readFileSync(layoutPath, 'utf-8')

  // Should have html and body tags (replacing _document.js)
  expect(layoutContent).toMatch(/<html.*lang/)
  expect(layoutContent).toMatch(/<body/)

  // Should include metadata (replacing Head in _document.js)
  expect(layoutContent).toMatch(/metadata|Metadata/)

  // Should accept children prop with ReactNode type
  expect(layoutContent).toMatch(/children.*ReactNode/)
})

test('Home page migrated to Server Component with async data fetching', () => {
  const pagePath = join(process.cwd(), 'app', 'page.tsx')
  expect(existsSync(pagePath)).toBe(true)

  const pageContent = readFileSync(pagePath, 'utf-8')

  // Should be async Server Component
  expect(pageContent).toMatch(
    /export\s+default\s+async\s+function|async\s+function.*Page/
  )

  // Should NOT have 'use client' directive
  expect(pageContent).not.toMatch(/['"]use client['"];?/)

  // Should use fetch instead of getServerSideProps
  expect(pageContent).toMatch(/await\s+fetch|fetch\(/)

  // Should not have getServerSideProps in actual code (comments OK)
  expect(stripComments(pageContent)).not.toMatch(/getServerSideProps/)
})

test('Blog index migrated with ISR equivalent', () => {
  const blogPath = join(process.cwd(), 'app', 'blog', 'page.tsx')
  expect(existsSync(blogPath)).toBe(true)

  const blogContent = readFileSync(blogPath, 'utf-8')

  // Should be async Server Component
  expect(blogContent).toMatch(
    /export\s+default\s+async\s+function|async\s+function/
  )

  // Should use revalidate for ISR
  expect(blogContent).toMatch(
    /revalidate.*\d+|next.*revalidate|export.*const.*revalidate.*=.*\d+/
  )

  // Should not have getStaticProps in actual code (comments OK)
  expect(stripComments(blogContent)).not.toMatch(/getStaticProps/)
})

test('Dynamic blog route migrated to generateStaticParams', () => {
  const dynamicPath = join(process.cwd(), 'app', 'blog', '[id]', 'page.tsx')
  expect(existsSync(dynamicPath)).toBe(true)

  const dynamicContent = readFileSync(dynamicPath, 'utf-8')

  // Should export generateStaticParams
  expect(dynamicContent).toMatch(
    /export.*generateStaticParams|generateStaticParams.*export/
  )

  // Should be async Server Component
  expect(dynamicContent).toMatch(
    /export\s+default\s+async\s+function|async\s+function/
  )

  // Should not have getStaticPaths or getStaticProps in actual code (comments OK)
  expect(stripComments(dynamicContent)).not.toMatch(
    /getStaticPaths|getStaticProps/
  )
})

test('API routes migrated to Route Handlers', () => {
  // Check posts index route
  const postsRoutePath = join(process.cwd(), 'app', 'api', 'posts', 'route.ts')
  expect(existsSync(postsRoutePath)).toBe(true)

  const postsRouteContent = readFileSync(postsRoutePath, 'utf-8')

  // Should export HTTP method functions
  expect(postsRouteContent).toMatch(/export.*GET|export.*POST/)

  // Should use Request/Response or Next APIs
  expect(postsRouteContent).toMatch(/Request|Response|NextRequest|NextResponse/)

  // Check dynamic API route
  const dynamicApiPath = join(
    process.cwd(),
    'app',
    'api',
    'posts',
    '[id]',
    'route.ts'
  )
  expect(existsSync(dynamicApiPath)).toBe(true)

  const dynamicApiContent = readFileSync(dynamicApiPath, 'utf-8')

  // Should export HTTP methods
  expect(dynamicApiContent).toMatch(/export.*GET|export.*PUT|export.*DELETE/)
})

test('Metadata API replaces next/head', () => {
  const pagePath = join(process.cwd(), 'app', 'page.tsx')
  const pageContent = readFileSync(pagePath, 'utf-8')

  // Should use Metadata export instead of Head component
  expect(pageContent).toMatch(/export.*metadata|metadata.*Metadata/)

  // Should not import or use next/head
  expect(pageContent).not.toMatch(/import.*Head.*next\/head|<Head>/)

  // Check blog page too
  const blogPath = join(process.cwd(), 'app', 'blog', 'page.tsx')
  if (existsSync(blogPath)) {
    const blogContent = readFileSync(blogPath, 'utf-8')
    expect(blogContent).toMatch(/export.*metadata|metadata.*Metadata/)
    expect(blogContent).not.toMatch(/import.*Head.*next\/head|<Head>/)
  }
})

test('Error handling migrated to error.js and not-found.js', () => {
  // Check for error.js file
  const errorPath = join(process.cwd(), 'app', 'error.tsx')
  expect(existsSync(errorPath)).toBe(true)

  const errorContent = readFileSync(errorPath, 'utf-8')

  // Should be a Client Component for error boundaries
  expect(errorContent).toMatch(/['"]use client['"];?/)

  // Should accept error props
  expect(errorContent).toMatch(/error.*Error|Error.*error/)

  // Check for not-found.js file
  const notFoundPath = join(process.cwd(), 'app', 'not-found.tsx')
  expect(existsSync(notFoundPath)).toBe(true)
})

test('Client components use next/navigation hooks', () => {
  // Check specific client component that should use useRouter
  const homeClientPath = join(process.cwd(), 'app', 'home-client.tsx')

  if (existsSync(homeClientPath)) {
    const content = readFileSync(homeClientPath, 'utf-8')

    if (content.includes('useRouter')) {
      // Should import from next/navigation, not next/router
      expect(content).toMatch(/import.*useRouter.*next\/navigation/)
      expect(content).not.toMatch(/import.*useRouter.*next\/router/)
    }
  }
})
