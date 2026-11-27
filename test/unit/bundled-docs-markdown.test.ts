import { join } from 'path'

import { execFileSync } from 'child_process'

const { docsPath, routerOf } = require('next/taskfile-docs')

// The converter loads an ESM-only MDX parser that Jest cannot import, so it
// runs in plain Node through a small script.
function run(input: unknown) {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [join(__dirname, 'bundled-docs-markdown-convert.js')],
      {
        input: JSON.stringify(input),
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
      }
    )
  )
}
const toMarkdown = (
  source: string,
  {
    relativePath,
    shared,
  }: { relativePath: string; shared?: Record<string, string> }
): string => run({ source, relativePath, shared })

/** The lines of a Markdown file that are not inside a code block, with the fence lines. */
function prose(markdown: string) {
  const lines: string[] = []
  const fences: string[] = []
  let fence: string | null = null
  for (const line of markdown.split('\n')) {
    const match = line.match(/^\s*(`{3,}|~{3,})(.*)$/)
    if (fence) {
      if (
        match &&
        match[1][0] === fence[0] &&
        match[1].length >= fence.length &&
        !match[2].trim()
      )
        fence = null
      continue
    }
    if (match) {
      fence = match[1]
      fences.push(line)
      continue
    }
    lines.push(line)
  }
  return { lines, fences }
}

describe('bundled docs as Markdown', () => {
  it("keeps only the file's own router", () => {
    const source = [
      '---',
      'title: Page',
      '---',
      '',
      'Shared.',
      '',
      '<AppOnly>',
      '',
      'App only.',
      '',
      '</AppOnly>',
      '',
      '<PagesOnly>',
      '',
      'Pages only.',
      '',
      '</PagesOnly>',
      '',
      'After.',
    ].join('\n')
    const app = toMarkdown(source, {
      relativePath: '01-app/02-guides/page.mdx',
    })
    expect(app).toContain('App only.')
    expect(app).not.toContain('Pages only.')
    expect(app).not.toContain('AppOnly')
    const pages = toMarkdown(source, {
      relativePath: '02-pages/02-guides/page.mdx',
    })
    expect(pages).toContain('Pages only.')
    expect(pages).not.toContain('App only.')
    // A page that belongs to neither router keeps both.
    const neither = toMarkdown(source, {
      relativePath: '04-community/page.mdx',
    })
    expect(neither).toContain('App only.')
    expect(neither).toContain('Pages only.')
    for (const output of [app, pages, neither]) {
      expect(output).toContain('title: Page')
      expect(output).toContain('Shared.')
      expect(output).toContain('After.')
    }
  })

  it('resolves router tags inside a sentence', () => {
    const source = [
      'Edit the <AppOnly>`app/page.tsx`</AppOnly><PagesOnly>`pages/index.tsx`</PagesOnly> file and save it.',
      '',
      'Forward the request to a <AppOnly>[Route Handler](/docs/app/route)</AppOnly> <PagesOnly>[API Route](/docs/pages/api)</PagesOnly>.',
      '',
      'Wrap content in an `<AppOnly>` or `<PagesOnly>` component.',
    ].join('\n')
    expect(toMarkdown(source, { relativePath: '01-app/page.mdx' })).toBe(
      [
        'Edit the `app/page.tsx` file and save it.',
        '',
        'Forward the request to a [Route Handler](/docs/app/route).',
        '',
        'Wrap content in an `<AppOnly>` or `<PagesOnly>` component.',
      ].join('\n')
    )
    expect(toMarkdown(source, { relativePath: '02-pages/page.mdx' })).toBe(
      [
        'Edit the `pages/index.tsx` file and save it.',
        '',
        'Forward the request to a [API Route](/docs/pages/api).',
        '',
        'Wrap content in an `<AppOnly>` or `<PagesOnly>` component.',
      ].join('\n')
    )
  })

  it('handles the shapes that defeat pattern matching', () => {
    const source = [
      '<PagesOnly>',
      '',
      'Outer.',
      '',
      '<PagesOnly>',
      '',
      'Nested.',
      '',
      '</PagesOnly>',
      '',
      'Still outer.',
      '',
      '</PagesOnly >',
      '',
      '- Item one',
      '',
      '  <AppOnly>',
      '',
      '  Inside a list item.',
      '',
      '  </AppOnly>',
      '',
      '- Item two',
    ].join('\n')
    const app = toMarkdown(source, { relativePath: '01-app/page.mdx' })
    expect(app).not.toMatch(/Outer|Nested|PagesOnly|AppOnly/)
    expect(app).toContain('- Item one')
    expect(app).toContain('  Inside a list item.')
    expect(app).toContain('- Item two')
    const pages = toMarkdown(source, { relativePath: '02-pages/page.mdx' })
    expect(pages).toContain('Outer.')
    expect(pages).toContain('Nested.')
    expect(pages).toContain('Still outer.')
    expect(pages).not.toMatch(/Inside a list item|PagesOnly|AppOnly/)
  })

  it('fills a page that shares content from the page it names', () => {
    const pointer = [
      '---',
      'title: CSS',
      'source: app/getting-started/css',
      '---',
      '',
      '{/* DO NOT EDIT. */}',
      '',
    ].join('\n')
    const shared = [
      '---',
      'title: App CSS',
      '---',
      '',
      '<PagesOnly>',
      '',
      'For Pages.',
      '',
      '</PagesOnly>',
      '',
      'Body.',
    ].join('\n')
    const output = toMarkdown(pointer, {
      relativePath: '02-pages/01-getting-started/06-css.mdx',
      shared: { 'app/getting-started/css': shared },
    })
    expect(output).toContain('title: CSS')
    expect(output).not.toContain('title: App CSS')
    expect(output).toContain('For Pages.')
    expect(output).toContain('Body.')
    expect(output).not.toContain('DO NOT EDIT')
  })

  it('keeps the TypeScript sample of a pair and leaves other code alone', () => {
    const source = [
      '```tsx filename="app/page.tsx" switcher',
      'export default function Page() {}',
      '```',
      '',
      '```jsx filename="app/page.js" switcher',
      'export default function Page() {}',
      '```',
      '',
      '```jsx filename="app/only.js"',
      '<AppOnly>',
      "<div style={{ color: 'red' }} />",
      '```',
    ].join('\n')
    const output = toMarkdown(source, { relativePath: '01-app/page.mdx' })
    expect(output).toContain('```tsx filename="app/page.tsx"\n')
    expect(output).not.toContain('switcher')
    expect(output).not.toContain('app/page.js')
    // Inside a code block, nothing is treated as markup.
    expect(output).toContain(
      '```jsx filename="app/only.js"\n<AppOnly>\n<div style={{ color: \'red\' }} />\n```'
    )
  })

  it('turns website layout into Markdown', () => {
    const source = [
      '<div',
      '  style={{',
      "    padding: '1rem',",
      '  }}',
      '>',
      '  Start with the guide.',
      '</div>',
      '',
      '<FixCardGrid>',
      '  <FixCard',
      '    group="cache"',
      '    title="Cache the timestamp"',
      '    href="#cache-the-timestamp"',
      '    snippets={[',
      '      { text: \'  "use cache"\', highlight: true },',
      "      { text: 'return <time>{Date.now()}</time>' },",
      '    ]}',
      '  />',
      '</FixCardGrid>',
      '',
      '<Video',
      '  caption="Analyzer walkthrough"',
      '  src="/videos/analyzer.mp4"',
      '  width={1708}',
      '/>',
      '',
      '<Image',
      '  alt="App Folder Structure"',
      '  srcLight="/docs/light/app.png"',
      '  srcDark="/docs/dark/app.png"',
      '  width="1600"',
      '/>',
    ].join('\n')
    const output = toMarkdown(source, {
      relativePath: 'blocking-prerender-current-time.mdx',
    })
    expect(output).toBe(
      [
        'Start with the guide.',
        '',
        'Cache: [Cache the timestamp](#cache-the-timestamp)',
        '',
        '```',
        '  "use cache"',
        'return <time>{Date.now()}</time>',
        '```',
        '',
        '[Analyzer walkthrough](/videos/analyzer.mp4)',
        '',
        '![App Folder Structure](/docs/light/app.png)',
      ].join('\n')
    )
  })

  it('turns the tick and cross icons into characters, in table cells too', () => {
    const source = [
      '| Option | App | Pages |',
      '| --- | --- | --- |',
      '| `a` | <Check size={18} /> | <Cross size={18} /> |',
      '',
      'Name them as `<Check />` in prose.',
    ].join('\n')
    expect(toMarkdown(source, { relativePath: '01-app/page.mdx' })).toBe(
      [
        '| Option | App | Pages |',
        '| --- | --- | --- |',
        '| `a` | ✓ | ✗ |',
        '',
        'Name them as `<Check />` in prose.',
      ].join('\n')
    )
  })

  it('names a docs file the way pages refer to it', () => {
    expect(docsPath('01-app/02-guides/forms.mdx')).toBe('app/guides/forms')
  })

  // Every page the package ships, converted the way the build converts it.
  describe('every docs and error page', () => {
    let pages: {
      name: string
      file: string
      source: string
      output: string
      sharedFound: boolean | null
    }[] = []
    beforeAll(() => {
      pages = run({ corpus: true })
    })

    it('has no website markup left outside code', () => {
      const left: string[] = []
      for (const page of pages) {
        const { lines, fences } = prose(page.output)
        for (const line of lines) {
          if (
            /^\s*\{\/\*/.test(line) ||
            // Anywhere in a line, except where a page names a tag in inline code.
            /<\/?(AppOnly|PagesOnly|FixCardGrid|FixCard|Image|Video|Check|Cross)\b/.test(
              line.replace(/`+[^`]*`+/g, '')
            )
          ) {
            left.push(`${page.name}: ${line.trim()}`)
          }
        }
        for (const line of fences)
          if (/\sswitcher(\s|$)/.test(line))
            left.push(`${page.name}: ${line.trim()}`)
      }
      expect(left).toEqual([])
    })

    it('keeps every heading that is not for the other router', () => {
      const missing: string[] = []
      for (const page of pages) {
        // A page that shares content takes its headings from the page it names.
        if (
          /^source:/m.test(
            page.source.match(/^---\n[\s\S]*?\n---\n/)?.[0] ?? ''
          )
        )
          continue
        const kept = new Set(
          prose(page.output).lines.filter((line) => /^#{1,6} /.test(line))
        )
        let other = 0
        for (const line of prose(page.source).lines) {
          const open = line.match(/^\s*<(AppOnly|PagesOnly)>\s*$/)
          if (open) {
            const router = routerOf(page.file)
            const mine =
              router === 'app'
                ? 'AppOnly'
                : router === 'pages'
                  ? 'PagesOnly'
                  : null
            if (other > 0 || (mine && open[1] !== mine)) other++
            continue
          }
          if (/^\s*<\/(AppOnly|PagesOnly)>\s*$/.test(line)) {
            if (other > 0) other--
            continue
          }
          if (other === 0 && /^#{1,6} /.test(line) && !kept.has(line))
            missing.push(`${page.name}: ${line}`)
        }
      }
      expect(missing).toEqual([])
    })

    it('resolves every page that shares content', () => {
      const unresolved = pages
        // The page it names exists, and its content replaced the note to docs authors.
        .filter(
          (page) =>
            page.sharedFound === false ||
            (page.sharedFound && page.output.includes('DO NOT EDIT'))
        )
        .map((page) => page.name)
      expect(pages.filter((page) => page.sharedFound).length).toBeGreaterThan(
        100
      )
      expect(unresolved).toEqual([])
    })
  })
})
