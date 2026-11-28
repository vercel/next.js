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
    files,
  }: {
    relativePath: string
    shared?: Record<string, string>
    files?: Record<string, string>
  }
): string => run({ source, relativePath, shared, files })

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

  it('drops each JavaScript twin when two TypeScript samples come before their twins', () => {
    const sample = (lang: string, file: string, body: string) =>
      [`\`\`\`${lang} filename="${file}" switcher`, body, '```'].join('\n')
    const source = [
      sample('tsx', 'app/page.tsx', 'const page = 1'),
      sample('tsx', 'app/search.tsx', 'const search = 1'),
      sample('jsx', 'app/page.js', 'const pageJs = 1'),
      sample('jsx', 'app/search.js', 'const searchJs = 1'),
      // A JavaScript sample with no TypeScript one above it stays.
      sample('jsx', 'app/alone.js', 'const alone = 1'),
    ].join('\n\n')
    const output = toMarkdown(source, { relativePath: '01-app/page.mdx' })
    expect(output).toContain('const page = 1')
    expect(output).toContain('const search = 1')
    expect(output).not.toContain('pageJs')
    expect(output).not.toContain('searchJs')
    expect(output).toContain('```jsx filename="app/alone.js"\nconst alone = 1')
    expect(output).not.toContain('switcher')
  })

  it('leaves blank lines inside a code block as written', () => {
    const source = [
      'Before.',
      '',
      '```txt',
      'one',
      '',
      '',
      '',
      'two',
      '```',
    ].join('\n')
    expect(toMarkdown(source, { relativePath: '01-app/page.mdx' })).toBe(source)
  })

  it('removes a note to docs authors after text on the same line, and an empty anchor', () => {
    const source = [
      '- Prerendering is the default. {/* TODO: update later */}',
      '',
      '<span id="old-anchor" />',
      '',
      '## Heading',
      '',
      'A <span>kept</span> word.',
    ].join('\n')
    const output = toMarkdown(source, { relativePath: '01-app/page.mdx' })
    expect(output).toBe(
      [
        '- Prerendering is the default.',
        '',
        '## Heading',
        '',
        'A <span>kept</span> word.',
      ].join('\n')
    )
  })

  it('lists the pages under a section page that has no body', () => {
    const page = (title: string, description?: string) =>
      [
        '---',
        `title: ${title}`,
        description && `description: ${description}`,
        '---',
        '',
        'Body.',
      ]
        .filter((line) => line !== undefined && line !== false)
        .join('\n')
    const files = {
      '01-app/02-guides/index.mdx': page('Guides'),
      '01-app/02-guides/10-forms.mdx': page('Forms', '"Build forms."'),
      '01-app/02-guides/2-caching.mdx': page('Caching', 'Cache data.'),
      '01-app/02-guides/testing/index.mdx': page('Testing'),
      '01-app/02-guides/testing/playwright.mdx': page('Playwright'),
      '01-app/03-api-reference/index.mdx': page('API Reference'),
    }
    const index = '---\ntitle: Guides\n---\n'
    expect(
      toMarkdown(index, { relativePath: '01-app/02-guides/index.mdx', files })
    ).toBe(
      [
        '---',
        'title: Guides',
        '---',
        '',
        '- [Caching](/docs/app/guides/caching): Cache data.',
        '- [Forms](/docs/app/guides/forms): Build forms.',
        '- [Testing](/docs/app/guides/testing)',
        '',
      ].join('\n')
    )
    // A section page with its own content keeps it, without a list.
    expect(
      toMarkdown(index + '\nIntro.\n', {
        relativePath: '01-app/02-guides/index.mdx',
        files,
      })
    ).toBe(index + '\nIntro.\n')
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
        '[Analyzer walkthrough](https://h8DxKfmAPhn8O0p3.public.blob.vercel-storage.com/videos/analyzer.mp4)',
        '',
        '![App Folder Structure](https://h8DxKfmAPhn8O0p3.public.blob.vercel-storage.com/docs/light/app.png)',
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
          // Anywhere in a line, except where a page names a tag in inline code.
          const text = line.replace(/`+[^`]*`+/g, '')
          if (
            /\{\/\*/.test(text) ||
            /<span id="[^"]*"\s*\/>/.test(text) ||
            /<\/?(AppOnly|PagesOnly|FixCardGrid|FixCard|Image|Video|Check|Cross)\b/.test(
              text
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

    it('leaves no page without a body', () => {
      const empty = pages
        .filter(
          (page) =>
            page.output.replace(/^---\n[\s\S]*?\n---\n?/, '').trim() === ''
        )
        .map((page) => page.name)
      expect(empty).toEqual([])
    })

    it('keeps no JavaScript sample that repeats a TypeScript one', () => {
      // A paired JavaScript sample survives only where the page has no
      // TypeScript one to pair it with.
      const kept: string[] = []
      const isJs = (fence: string) => /^\s*`+jsx?\b/.test(fence)
      const isTs = (fence: string) => /^\s*`+tsx?\b/.test(fence)
      const paired = (fence: string) => /\sswitcher(\s|$)/.test(fence)
      for (const page of pages) {
        if (page.source.includes('\nsource:')) continue
        const source = prose(page.source).fences.filter(paired)
        const unmatched = Math.max(
          0,
          source.filter(isJs).length - source.filter(isTs).length
        )
        const before = prose(page.source).fences.filter(isJs).length
        const after = prose(page.output).fences.filter(isJs).length
        const dropped = before - after
        if (dropped < source.filter(isJs).length - unmatched)
          kept.push(
            `${page.name}: ${source.filter(isJs).length - dropped} left`
          )
      }
      expect(kept).toEqual([])
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
