import {
  getMiddlewareMatchers,
  getPagesPageStaticInfo,
} from './get-page-static-info'
import { join } from 'path'
import { writeFile, mkdir, rm } from 'fs/promises'
import { tmpdir } from 'os'

describe('get-page-static-infos', () => {
  describe('getMiddlewareMatchers', () => {
    it('sets originalSource with one matcher', () => {
      const matchers = '/middleware/path'
      const expected = [
        {
          originalSource: '/middleware/path',
          regexp:
            '^(?:\\/(_next\\/data\\/[^/]{1,}))?\\/middleware\\/path(\\.json)?[\\/#\\?]?$',
        },
      ]
      const result = getMiddlewareMatchers(matchers, { i18n: undefined })
      expect(result).toStrictEqual(expected)
    })

    it('sets originalSource with multiple matchers', () => {
      const matchers = ['/middleware/path', '/middleware/another-path']
      const expected = [
        {
          originalSource: '/middleware/path',
          regexp:
            '^(?:\\/(_next\\/data\\/[^/]{1,}))?\\/middleware\\/path(\\.json)?[\\/#\\?]?$',
        },
        {
          originalSource: '/middleware/another-path',
          regexp:
            '^(?:\\/(_next\\/data\\/[^/]{1,}))?\\/middleware\\/another-path(\\.json)?[\\/#\\?]?$',
        },
      ]
      const result = getMiddlewareMatchers(matchers, { i18n: undefined })
      expect(result).toStrictEqual(expected)
    })

    it('matches /:id and /:id.json', () => {
      const matchers = ['/:id']
      const result = getMiddlewareMatchers(matchers, { i18n: undefined })[0]
        .regexp
      const regex = new RegExp(result)
      expect(regex.test('/apple')).toBe(true)
      expect(regex.test('/apple.json')).toBe(true)
    })
  })

  describe('getPagesPageStaticInfo', () => {
    let testDir: string

    beforeEach(async () => {
      // Create a unique temporary directory for each test
      testDir = join(tmpdir(), `next-test-${Date.now()}-${Math.random()}`)
      await mkdir(testDir, { recursive: true })
    })

    afterEach(async () => {
      // Clean up test directory
      try {
        await rm(testDir, { recursive: true, force: true })
      } catch (e) {
        // Ignore cleanup errors
      }
    })

    it('should throw error when "use server" directive is used in Pages Router', async () => {
      const pageContent = `"use server"

export default function Page() {
  return <div>Hello</div>
}`

      const pageFilePath = join(testDir, 'page.tsx')
      await writeFile(pageFilePath, pageContent)

      await expect(
        getPagesPageStaticInfo({
          pageFilePath,
          nextConfig: {} as any,
          isDev: false,
          page: '/test-page',
          pageType: 'pages' as const,
        })
      ).rejects.toThrow(
        'Page "/test-page" cannot use "use server" directive. Server Actions are only supported in the App Router'
      )
    })

    it('should throw error for "use server" even without other keywords (PARSE_PATTERN test)', async () => {
      // This test verifies that PARSE_PATTERN includes "use\s" to trigger parsing
      // Without this, files with only "use server" would skip AST parsing
      const pageContent = `"use server"

export default function Page() {
  return <div>Hello</div>
}`

      const pageFilePath = join(testDir, 'page-minimal.tsx')
      await writeFile(pageFilePath, pageContent)

      // Should throw even though file has no getStaticProps, export const, etc.
      await expect(
        getPagesPageStaticInfo({
          pageFilePath,
          nextConfig: {} as any,
          isDev: false,
          page: '/minimal-page',
          pageType: 'pages' as const,
        })
      ).rejects.toThrow(
        'Page "/minimal-page" cannot use "use server" directive. Server Actions are only supported in the App Router'
      )
    })

    it('should allow "use client" directive in Pages Router', async () => {
      const pageContent = `"use client"

export default function Page() {
  return <div>Hello</div>
}`

      const pageFilePath = join(testDir, 'page.tsx')
      await writeFile(pageFilePath, pageContent)

      // Should not throw - "use client" is allowed in Pages Router
      const result = await getPagesPageStaticInfo({
        pageFilePath,
        nextConfig: {} as any,
        isDev: false,
        page: '/test-page',
        pageType: 'pages' as const,
      })

      expect(result).toBeDefined()
      expect(result.type).toBe('pages')
    })

    it('should not throw error for Pages Router pages without directives', async () => {
      const pageContent = `export default function Page() {
  return <div>Hello</div>
}

export async function getStaticProps() {
  return { props: {} }
}`

      const pageFilePath = join(testDir, 'page.tsx')
      await writeFile(pageFilePath, pageContent)

      const result = await getPagesPageStaticInfo({
        pageFilePath,
        nextConfig: {} as any,
        isDev: false,
        page: '/test-page',
        pageType: 'pages' as const,
      })

      expect(result).toBeDefined()
      expect(result.type).toBe('pages')
      expect(result.getStaticProps).toBe(true)
    })

    it('should not throw error for directives in comments or strings', async () => {
      const pageContent = `// "use server" in a comment
export default function Page() {
  const str = "use client"
  return <div>Hello</div>
}`

      const pageFilePath = join(testDir, 'page.tsx')
      await writeFile(pageFilePath, pageContent)

      const result = await getPagesPageStaticInfo({
        pageFilePath,
        nextConfig: {} as any,
        isDev: false,
        page: '/test-page',
        pageType: 'pages' as const,
      })

      expect(result).toBeDefined()
      expect(result.type).toBe('pages')
    })

    it('should not trigger on React hooks or variables containing "use"', async () => {
      const pageContent = `import { useState, useEffect } from 'react'

export default function Page() {
  const [state, setState] = useState(0)
  const useServer = () => {}
  useEffect(() => {}, [])
  return <div>Hello</div>
}`

      const pageFilePath = join(testDir, 'page.tsx')
      await writeFile(pageFilePath, pageContent)

      const result = await getPagesPageStaticInfo({
        pageFilePath,
        nextConfig: {} as any,
        isDev: false,
        page: '/test-page',
        pageType: 'pages' as const,
      })

      expect(result).toBeDefined()
      expect(result.type).toBe('pages')
    })
  })
})
