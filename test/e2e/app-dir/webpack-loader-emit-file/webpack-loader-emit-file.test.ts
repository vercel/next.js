import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { readdir } from 'fs/promises'
import path from 'path'

describe('webpack-loader-emit-file', () => {
  const { next, isNextDev, isTurbopack } = nextTestSetup({
    files: __dirname,
    dependencies: {
      'file-loader': '6.2.0',
      'emit-file-loader': '0.0.2',
      'auto-import-x-loader': '0.0.4',
      'postcss-loader': '8.2.1',
      postcss: '8.5.6',
    },
  })

  async function fetchAsset(name: string) {
    const response = await next.fetch(
      `/_next/static/media/${name}${next.getAssetQuery()}`
    )
    expect(response.status).toBe(200)
    return Buffer.from(await response.arrayBuffer())
  }

  it('emits text and binary assets from server and browser modules', async () => {
    const browser = await next.browser('/')
    for (const name of ['server', 'client']) {
      expect(await browser.elementByCss(`#${name}-asset`).text()).toBe(
        `/_next/static/media/${name}.txt`
      )
      expect((await fetchAsset(`${name}.txt`)).toString()).toBe(
        `${name}-before\n`
      )
      expect(await fetchAsset(`${name}.bin`)).toEqual(
        Buffer.from([0, 255, 128, 10])
      )
      expect(await fetchAsset(`${name}.empty`)).toEqual(Buffer.alloc(0))
      expect(await fetchAsset(`${name}.empty-bin`)).toEqual(Buffer.alloc(0))
      expect((await fetchAsset(`${name}.chain`)).toString()).toBe(
        'chain-content'
      )
    }
  })

  it('emits assets from pitch functions and CSS transforms', async () => {
    const $ = await next.render$('/')
    expect($('#pitch-asset').text()).toBe('/_next/static/media/pitch.txt')
    expect((await fetchAsset('pitch.txt')).toString()).toBe('pitch-content')
    expect((await fetchAsset('css.txt')).toString()).toBe('css-emitted-content')
    const browser = await next.browser('/')
    expect(
      await browser.eval(() => getComputedStyle(document.body).color)
    ).toBe('rgb(1, 2, 3)')
  })

  it('emits public assets from the edge compiler', async () => {
    const response = await next.fetch('/edge')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      asset: '/_next/static/media/edge.txt',
      mapped: 'mapped-files',
    })
    expect((await fetchAsset('edge.txt')).toString()).toBe('edge-before\n')
    expect(await fetchAsset('edge.bin')).toEqual(Buffer.from([0, 255, 128, 10]))
  })

  it('preserves assets emitted by each matching rule', async () => {
    await next.render('/')
    expect((await fetchAsset('server.txt')).toString()).toBe('server-before\n')
    expect((await fetchAsset('server-extra.txt')).toString()).toBe(
      'extra-rule-content'
    )
    expect((await fetchAsset('server.overwrite')).toString()).toBe('last-rule')
  })

  it('emits referenced source maps for JavaScript, CSS, and original-source filename mappings', async () => {
    const $ = await next.render$('/')
    expect($('#mapped-value').text()).toBe('mapped-files')
    expect($('#postcss-value').text()).toContain('color: blue')
    for (const [name, source, original] of [
      ['mapped-asset.js', 'original.js', 'console.log("original-asset");\n'],
      ['mapped-styles.css', 'original.css', 'body { color: red; }'],
      ['postcss-emitted.css', 'postcss-source.css', 'p { color: blue; }'],
      [
        'original-name.js',
        'original-name-source.js',
        'console.log("mapped-asset");\n',
      ],
    ]) {
      const content = (await fetchAsset(name)).toString()
      expect(content).toContain(`sourceMappingURL=${name}.map`)
      const map = JSON.parse((await fetchAsset(`${name}.map`)).toString())
      expect(map.version).toBe(3)
      expect(map.file.replace(/\\/g, '/').split('/').pop()).toBe(name)
      expect(map.sources.some((item: string) => item.endsWith(source))).toBe(
        true
      )
      expect(map.sourcesContent).toContain(original)
      expect(map.mappings).not.toBe('')
    }
  })

  it('minifies emitted assets with webpack-compatible minimized metadata', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#minify-value').text()).toBe('minify')
    const code = '// minify-comment\nconsole.log( "minify" + "-me" );\n'
    expect((await fetchAsset('already-minified.js')).toString()).toBe(code)
    const js = (await fetchAsset('minify-me.js')).toString()
    if (isNextDev) {
      expect(js).toBe(code)
    } else {
      expect(js).not.toContain('minify-comment')
      expect(js).toContain('console.log(')
    }
    for (const name of ['minify-me.css', 'already-minified.css']) {
      const css = (await fetchAsset(name)).toString()
      if (isNextDev) {
        expect(css).toContain('minify-comment')
      } else {
        expect(css).not.toContain('minify-comment')
        expect(css.replace(/\s/g, '')).toContain('p{color:red}')
      }
    }
  })

  it('emits files from modules loaded with importModule', async () => {
    const $ = await next.render$('/')
    expect($('#imported-value').text()).toBe('imported-value')
    expect((await fetchAsset('imported-sidecar.txt')).toString()).toBe(
      'sidecar-imported'
    )
  })

  it('retains emissions through JSON, text, raw, bytes, and asset module transforms', async () => {
    const $ = await next.render$('/')
    const values = JSON.parse($('#non-js-values').text())
    expect(values.json).toEqual({ value: 'json-payload' })
    expect(values.text).toBe('non-js-payload\n')
    expect(values.raw).toBe('non-js-payload\n')
    expect(values.bytes).toEqual(Array.from(Buffer.from('non-js-payload\n')))
    for (const kind of ['json', 'text', 'raw', 'bytes', 'asset']) {
      expect((await fetchAsset(`${kind}-sidecar.txt`)).toString()).toBe(
        `sidecar-${kind}`
      )
    }
    const response = await next.fetch(values.asset + next.getAssetQuery())
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('non-js-payload\n')
  })

  it('writes query-suffixed asset names to their unsuffixed output path', async () => {
    await next.render('/')
    for (const query of ['?version=1', '?version=2']) {
      const response = await next.fetch(`/_next/static/media/query.txt${query}`)
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('query-content')
    }
  })

  // @force-gate turbopack
  it('accepts indexed source maps and ignores invalid ones', async () => {
    await next.render('/')
    expect((await fetchAsset('indexed-map.js')).toString()).toContain(
      'mapped-asset'
    )
    expect((await fetchAsset('invalid-map.js')).toString()).toContain(
      'mapped-asset'
    )
    const map = (await fetchAsset('indexed-map.js.map')).toString()
    expect(map).toContain('indexed-original.js')
    const invalid = await next.fetch(
      `/_next/static/media/invalid-map.js.map${next.getAssetQuery()}`
    )
    expect(invalid.status).toBe(404)
  })

  it('resolves URL and filesystem source roots in emitted maps', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#client-mapped-value').text()).toBe(
      'mapped-files'
    )
    for (const [name, suffix] of [
      ['url', 'https://example.com/src/original.js'],
      ['filesystem', '/sources/original.js'],
      ['relative', '/sources/original.js'],
    ]) {
      const map = JSON.parse(
        (await fetchAsset(`root-${name}.js.map`)).toString()
      )
      expect(map.sources[0].replace(/\\/g, '/')).toEndWith(suffix)
      expect(map.sourcesContent).toEqual(['root-original'])
    }
  })

  it('keeps emitted files from a module marked side-effect-free', async () => {
    const $ = await next.render$('/')
    expect($('#pure-value').text()).toBe('pure-value')
    expect((await fetchAsset('pure.txt')).toString()).toBe(
      'retained-after-tree-shaking'
    )
  })

  it('does not build skipped dependencies solely for loader emissions in Turbopack', async () => {
    const $ = await next.render$('/')
    expect($('#transitive-value').text()).toBe('transitive-value')
    const response = await next.fetch(
      `/_next/static/media/transitive-sidecar.txt${next.getAssetQuery()}`
    )
    expect(response.status).toBe(isTurbopack ? 404 : 200)
    if (!isTurbopack) {
      expect(await response.text()).toBe('sidecar-transitive')
    }
  })

  it('does not build skipped CommonJS dependencies solely for loader emissions in Turbopack', async () => {
    await next.render('/')
    const response = await next.fetch(
      `/_next/static/media/commonjs-sidecar.txt${next.getAssetQuery()}`
    )
    expect(response.status).toBe(isTurbopack ? 404 : 200)
    if (!isTurbopack) {
      expect(await response.text()).toBe('sidecar-commonjs')
    }
  })

  it("preserves published loaders' independently consumed outputs from retained modules", async () => {
    const $ = await next.render$('/')
    expect($('#template-value').text()).toBe('distributed-template')
    expect($('#auto-value').text()).toBe('42')
    expect((await fetchAsset('distributed-template.js')).toString()).toContain(
      'distributed-template'
    )
    const declarations = (await fetchAsset('auto-imports.d.ts')).toString()
    expect(declarations).toContain('declare global')
    expect(declarations).toContain("typeof import('react').useState")
  })

  // @force-gate !deploy && !dev
  it('retains emitted files after unused exports are removed from production code', async () => {
    const chunkDir = path.join(next.distDir, 'server/chunks')
    const files = await readdir(path.join(next.testDir, chunkDir), {
      recursive: true,
    })
    const code = await Promise.all(
      files
        .filter((file) => file.endsWith('.js'))
        .map((file) => next.readFile(path.join(chunkDir, file)))
    )
    expect(code.join('\n')).not.toContain('unused-export-marker')
    expect(code.join('\n')).not.toContain('unused-loader-runtime-marker')
    expect((await fetchAsset('pure.txt')).toString()).toBe(
      'retained-after-tree-shaking'
    )
  })

  // @force-gate turbopack && !deploy && dev
  it('does not create JavaScript runtime modules for emitted assets', async () => {
    await next.render('/')
    const chunkDir = path.join(next.distDir, 'server/chunks')
    const files = await readdir(path.join(next.testDir, chunkDir), {
      recursive: true,
    })
    const code = await Promise.all(
      files
        .filter((file) => file.endsWith('.js'))
        .map((file) => next.readFile(path.join(chunkDir, file)))
    )
    expect(code.join('\n')).not.toContain('(ecmascript, emitted file ')
  })

  it('runs file-loader with its default publicPath', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#file-asset').text()).toBe(
      '/_next/static/media/asset.file'
    )
    expect(await browser.elementByCss('#client-file-asset').text()).toBe(
      '/_next/static/media/asset.file'
    )
    expect((await fetchAsset('asset.file')).toString()).toBe(
      'file-loader-content\n'
    )
  })

  // A deployed fixture has no host filesystem to inspect; the fetch assertions above still run.
  // @force-gate !deploy
  it('places server-only assets relative to the server output directory', async () => {
    await next.render('/')
    expect(
      await next.readFile(
        `${next.distDir}/server/${isNextDev ? '' : 'chunks/'}loader-output/server.txt`
      )
    ).toBe('server-before\n')
  })

  // @force-gate !deploy && !windows
  it('does not alias a POSIX backslash filename to a nested path', async () => {
    await next.render('/')
    expect(
      await next.readFile(`${next.distDir}/static/media/literal\\name.txt`)
    ).toBe('backslash')
    expect(
      await next.readFile(`${next.distDir}/static/media/literal/name.txt`)
    ).toBe('slash')
  })

  // @force-gate dev
  it('updates emitted assets after editing the source', async () => {
    await next.render('/')
    for (const name of ['server', 'client']) {
      const file = `fixtures/${name}.emit`
      await next.patchFile(file, `${name}-after\n`, async () => {
        await retry(async () => {
          await next.render('/')
          expect((await fetchAsset(`${name}.txt`)).toString()).toBe(
            `${name}-after\n`
          )
        })
      })
    }
  })
})
