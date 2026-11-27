import { readFileSync } from 'fs'
import { join, relative } from 'path'
import glob from 'glob'

// The converter is plain CommonJS so the build's taskfile can require it.
const { toMarkdown, docsPath } = require('next/taskfile-docs')

const repoRoot = join(__dirname, '../..')
const docsRoot = join(repoRoot, 'docs')
const errorsRoot = join(repoRoot, 'errors')

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
      readSource: (path: string) =>
        path === 'app/getting-started/css' ? shared : null,
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
        '- [Cache the timestamp](#cache-the-timestamp)',
        '',
        '  ```',
        '    "use cache"',
        '  return <time>{Date.now()}</time>',
        '  ```',
        '',
        '![App Folder Structure](/docs/light/app.png)',
      ].join('\n')
    )
  })

  it('names a docs file the way pages refer to it', () => {
    expect(docsPath('01-app/02-guides/forms.mdx')).toBe('app/guides/forms')
  })

  // Every page the package ships, converted the way the build converts it.
  describe('every docs and error page', () => {
    const sources = new Map<string, string>()
    for (const file of glob.sync('**/*.mdx', { cwd: docsRoot })) {
      sources.set(docsPath(file), readFileSync(join(docsRoot, file), 'utf8'))
    }
    const readSource = (path: string) =>
      sources.get(path) ?? sources.get(`${path}/index`) ?? null
    const pages = [
      ...glob
        .sync('**/*.mdx', { cwd: docsRoot })
        .map((file) => ({ root: docsRoot, file })),
      ...glob
        .sync('*.mdx', { cwd: errorsRoot })
        .map((file) => ({ root: errorsRoot, file })),
    ].map(({ root, file }) => {
      const source = readFileSync(join(root, file), 'utf8')
      return {
        name: relative(repoRoot, join(root, file)),
        source,
        output: toMarkdown(source, {
          relativePath: file,
          readSource,
        }) as string,
      }
    })

    it('has no website markup left outside code', () => {
      const left: string[] = []
      for (const page of pages) {
        const { lines, fences } = prose(page.output)
        for (const line of lines) {
          if (
            /^\s*<\/?(FixCardGrid|FixCard|Image|Check|Cross)\b/.test(line) ||
            /^\s*\{\/\*/.test(line) ||
            // Router tags anywhere in a sentence, except where a page names them in inline code.
            /<\/?(AppOnly|PagesOnly)>/.test(line.replace(/`+[^`]*`+/g, ''))
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
            const mine = page.name.includes('/01-app/')
              ? 'AppOnly'
              : page.name.includes('/02-pages/')
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
      const unresolved: string[] = []
      for (const page of pages) {
        // Only the frontmatter names a shared page; the contribution guide shows one as an example.
        const frontmatter =
          page.source.match(/^---\n[\s\S]*?\n---\n/)?.[0] ?? ''
        const shared = frontmatter.match(/^source:\s*(\S+)\s*$/m)
        if (!shared) continue
        // The page it names exists, and its content replaced the note to docs authors.
        if (
          readSource(shared[1]) === null ||
          page.output.includes('DO NOT EDIT')
        ) {
          unresolved.push(page.name)
        }
      }
      expect(unresolved).toEqual([])
    })
  })
})
