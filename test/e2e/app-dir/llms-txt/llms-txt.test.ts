import { nextTestSetup } from 'e2e-utils'

describe('llms-txt - structured object', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should serve /llms.txt with correct content-type', async () => {
    const res = await next.fetch('/llms.txt')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/plain')
  })

  it('should render structured llms.txt content', async () => {
    const res = await next.fetch('/llms.txt')
    const text = await res.text()

    expect(text).toContain('# My Site')
    expect(text).toContain('> A description of my site')
    expect(text).toContain('Some additional details about the site.')
    expect(text).toContain('## Docs')
    expect(text).toContain('Documentation section')
    expect(text).toContain(
      '- [Getting Started](https://example.com/docs/getting-started): Learn how to get started'
    )
    expect(text).toContain('- [API Reference](https://example.com/docs/api)')
    expect(text).toContain('## Blog')
    expect(text).toContain(
      '- [Latest Post](https://example.com/blog/latest): Read the latest post'
    )
  })
})

describe('llms-txt - string return', () => {
  const { next } = nextTestSetup({
    files: {
      'app/layout.tsx': `export default function Layout({ children }) { return <html><body>{children}</body></html> }`,
      'app/page.tsx': `export default function Page() { return <p>hello</p> }`,
      'app/llms.ts': `export default function llms() { return '# My Site\\n\\nCustom llms.txt content' }`,
    },
  })

  it('should serve string llms.txt content', async () => {
    const res = await next.fetch('/llms.txt')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/plain')
    const text = await res.text()
    expect(text).toBe('# My Site\n\nCustom llms.txt content')
  })
})

describe('llms-txt - static file', () => {
  const { next } = nextTestSetup({
    files: {
      'app/layout.tsx': `export default function Layout({ children }) { return <html><body>{children}</body></html> }`,
      'app/page.tsx': `export default function Page() { return <p>hello</p> }`,
      'app/llms.txt': `# Static Site\n\nThis is a static llms.txt file.`,
    },
  })

  it('should serve static llms.txt file', async () => {
    const res = await next.fetch('/llms.txt')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/plain')
    const text = await res.text()
    expect(text).toContain('# Static Site')
  })
})
