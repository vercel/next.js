import { nextTestSetup } from 'e2e-utils'
import cheerio from 'cheerio'

describe('Export with next/legacy/image component', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  afterEach(async () => {
    await next.patchFile(
      'next.config.js',
      '// prettier-ignore\nmodule.exports = { /* replaceme */ }\n'
    )
    await next.patchFile(
      'pages/index.js',
      `import Image from 'next/legacy/image'

const loader = undefined

export default () => (
  <div>
    <p>Should succeed during export</p>
    <Image alt="icon" src="/i.png" width="10" height="10" loader={loader} />
  </div>
)
`
    )
  })

  it('should build with cloudinary loader', async () => {
    await next.patchFile('next.config.js', (content) =>
      content.replace(
        '{ /* replaceme */ }',
        JSON.stringify({
          output: 'export',
          images: {
            loader: 'cloudinary',
            path: 'https://example.com/',
          },
        })
      )
    )
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)

    const html = await next.readFile('out/index.html')
    const $ = cheerio.load(html)
    expect($('img[alt="icon"]').attr('alt')).toBe('icon')
  })

  it('should build with custom loader', async () => {
    await next.patchFile('next.config.js', (content) =>
      content.replace(
        '{ /* replaceme */ }',
        JSON.stringify({
          output: 'export',
          images: {
            loader: 'custom',
          },
        })
      )
    )
    await next.patchFile('pages/index.js', (content) =>
      content.replace(
        'loader = undefined',
        'loader = ({src}) => "/custom" + src'
      )
    )
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)

    const html = await next.readFile('out/index.html')
    const $ = cheerio.load(html)
    expect($('img[src="/custom/o.png"]')).toBeDefined()
  })

  it('should fail build with custom loader config but no loader prop', async () => {
    await next.patchFile('next.config.js', (content) =>
      content.replace(
        '{ /* replaceme */ }',
        JSON.stringify({
          output: 'export',
          images: {
            loader: 'custom',
          },
        })
      )
    )
    const { exitCode } = await next.build()
    expect(exitCode).toBe(1)
    expect(next.cliOutput).toContain(
      'Error: Image with src "/i.png" is missing "loader" prop'
    )
  })

  it('should build with unoptimized images', async () => {
    await next.patchFile('next.config.js', (content) =>
      content.replace(
        '{ /* replaceme */ }',
        JSON.stringify({
          output: 'export',
          images: {
            unoptimized: true,
          },
        })
      )
    )
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)

    const html = await next.readFile('out/index.html')
    const $ = cheerio.load(html)
    expect($('img[src="/o.png"]')).toBeDefined()
  })
})
