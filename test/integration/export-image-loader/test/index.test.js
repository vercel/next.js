/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import cheerio from 'cheerio'
import { nextBuild, nextExport, File } from 'next-test-utils'

const appDir = join(__dirname, '../')
const outdir = join(appDir, 'out')
const nextConfig = new File(join(appDir, 'next.config.js'))
const pagesIndexJs = new File(join(appDir, 'pages', 'index.js'))

describe('Export with cloudinary loader next/image component', () => {
  beforeAll(async () => {
    await nextConfig.replace(
      '{ /* replaceme */ }',
      JSON.stringify({
        images: {
          loader: 'cloudinary',
          path: 'https://example.com/',
        },
      })
    )
  })
  it('should build successfully', async () => {
    await fs.remove(join(appDir, '.next'))
    const { code } = await nextBuild(appDir)
    if (code !== 0) throw new Error(`build failed with status ${code}`)
  })

  it('should export successfully', async () => {
    const { code } = await nextExport(appDir, { outdir })
    if (code !== 0) throw new Error(`export failed with status ${code}`)
  })

  it('should contain img element in html output', async () => {
    const html = await fs.readFile(join(outdir, 'index.html'))
    const $ = cheerio.load(html)
    expect($('img[alt="icon"]').attr('alt')).toBe('icon')
  })

  afterAll(async () => {
    await nextConfig.restore()
  })
})

describe('Export with custom loader next/image component', () => {
  beforeAll(async () => {
    await nextConfig.replace(
      '{ /* replaceme */ }',
      JSON.stringify({
        images: {
          loader: 'custom',
        },
      })
    )
    await pagesIndexJs.replace(
      'loader = undefined',
      'loader = ({src}) => "/custom" + src'
    )
  })
  it('should build successfully', async () => {
    await fs.remove(join(appDir, '.next'))
    const { code } = await nextBuild(appDir)
    if (code !== 0) throw new Error(`build failed with status ${code}`)
  })

  it('should export successfully', async () => {
    const { code } = await nextExport(appDir, { outdir })
    if (code !== 0) throw new Error(`export failed with status ${code}`)
  })

  it('should contain img element with same src in html output', async () => {
    const html = await fs.readFile(join(outdir, 'index.html'))
    const $ = cheerio.load(html)
    expect($('img[src="/custom/o.png"]')).toBeDefined()
  })

  afterAll(async () => {
    await nextConfig.restore()
    await pagesIndexJs.restore()
  })
})

describe('Export with custom loader config but no loader prop on next/image', () => {
  beforeAll(async () => {
    await nextConfig.replace(
      '{ /* replaceme */ }',
      JSON.stringify({
        images: {
          loader: 'custom',
        },
      })
    )
  })
  it('should fail build', async () => {
    await fs.remove(join(appDir, '.next'))
    const { code, stderr } = await nextBuild(appDir, [], { stderr: true })
    expect(code).toBe(1)
    expect(stderr).toContain(
      'Error: Image with src "/i.png" is missing "loader" prop'
    )
  })

  afterAll(async () => {
    await nextConfig.restore()
    await pagesIndexJs.restore()
  })
})

describe('Export with loaderFile config next/image component', () => {
  beforeAll(async () => {
    await nextConfig.replace(
      '{ /* replaceme */ }',
      JSON.stringify({
        images: {
          loader: 'custom',
          loaderFile: './dummy-loader.js',
        },
      })
    )
  })
  it('should build successfully', async () => {
    await fs.remove(join(appDir, '.next'))
    const { code } = await nextBuild(appDir)
    if (code !== 0) throw new Error(`build failed with status ${code}`)
  })

  it('should export successfully', async () => {
    const { code } = await nextExport(appDir, { outdir })
    if (code !== 0) throw new Error(`export failed with status ${code}`)
  })

  it('should contain img element with same src in html output', async () => {
    const html = await fs.readFile(join(outdir, 'index.html'))
    const $ = cheerio.load(html)
    expect($('img[src="/i.png#w:32,q:50"]')).toBeDefined()
  })

  afterAll(async () => {
    await nextConfig.restore()
    await pagesIndexJs.restore()
  })
})

describe('Export with unoptimized next/image component', () => {
  beforeAll(async () => {
    await nextConfig.replace(
      '{ /* replaceme */ }',
      JSON.stringify({
        images: {
          unoptimized: true,
        },
      })
    )
  })
  it('should build successfully', async () => {
    await fs.remove(join(appDir, '.next'))
    const { code } = await nextBuild(appDir)
    if (code !== 0) throw new Error(`build failed with status ${code}`)
  })

  it('should export successfully', async () => {
    const { code } = await nextExport(appDir, { outdir })
    if (code !== 0) throw new Error(`export failed with status ${code}`)
  })

  it('should contain img element with same src in html output', async () => {
    const html = await fs.readFile(join(outdir, 'index.html'))
    const $ = cheerio.load(html)
    expect($('img[src="/o.png"]')).toBeDefined()
  })

  afterAll(async () => {
    await nextConfig.restore()
  })
})
