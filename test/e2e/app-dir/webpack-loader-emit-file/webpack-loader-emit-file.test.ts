import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { readdir } from 'fs/promises'
import path from 'path'

describe('webpack-loader-emit-file', () => {
  const { next, isNextDev, isNextDeploy, isTurbopack } = nextTestSetup({
    files: __dirname,
    dependencies: {
      'file-loader': '6.2.0',
      'auto-import-x-loader': '0.0.4',
      // Native oxc-transform bindings require a newer Node than the minimum CI version.
      '@oxc-transform/binding-wasm32-wasi': '0.105.0',
    },
  })

  async function fetchAsset(name: string) {
    const response = await next.fetch(
      `/_next/static/media/${name}${next.getDeploymentIdQuery()}`
    )
    expect(response.status).toBe(200)
    return Buffer.from(await response.arrayBuffer())
  }

  async function fetchSourceMap(name: string) {
    const response = await next.fetch(
      `/_next/static/media/${name}${next.getDeploymentIdQuery()}`
    )
    if (isNextDeploy) {
      // The deployment test project blocks source maps, including maps that do not exist.
      expect(response.status).toBe(403)
      return null
    }
    expect(response.status).toBe(200)
    return response.json()
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
    for (const [name, source, original] of [
      ['mapped-asset.js', 'original.js', 'console.log("original-asset");\n'],
      ['mapped-styles.css', 'original.css', 'body { color: red; }'],
      [
        'original-name.js',
        'original-name-source.js',
        'console.log("mapped-asset");\n',
      ],
    ]) {
      const content = (await fetchAsset(name)).toString()
      expect(content).toContain(`sourceMappingURL=${name}.map`)
      const map = await fetchSourceMap(`${name}.map`)
      if (!map) continue
      expect(map.version).toBe(3)
      expect(map.file.replace(/\\/g, '/').split('/').pop()).toBe(name)
      expect(map.sources.some((item: string) => item.endsWith(source))).toBe(
        true
      )
      expect(map.sourcesContent).toContain(original)
      expect(map.mappings).not.toBe('')
    }
  })

  it('emits files from modules loaded with importModule', async () => {
    const $ = await next.render$('/')
    expect($('#imported-value').text()).toBe('imported-value')
    expect((await fetchAsset('imported-sidecar.txt')).toString()).toBe(
      'sidecar-imported'
    )
  })

  it('retains emissions through JSON and asset module transforms', async () => {
    const $ = await next.render$('/')
    const values = JSON.parse($('#non-js-values').text())
    expect(values.json).toEqual({ value: 'json-payload' })
    for (const kind of ['json', 'asset']) {
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
      const response = await next.fetch(
        `/_next/static/media/query.txt${query}${next.getDeploymentIdQuery(true)}`
      )
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('query-content')
    }
  })

  // @force-gate turbopack
  it('ignores invalid source maps', async () => {
    await next.render('/')
    expect((await fetchAsset('invalid-map.js')).toString()).toContain(
      'mapped-asset'
    )
    const invalid = await next.fetch(
      `/_next/static/media/invalid-map.js.map${next.getDeploymentIdQuery()}`
    )
    expect(invalid.status).toBe(isNextDeploy ? 403 : 404)
  })

  it('keeps emitted files from a module marked side-effect-free', async () => {
    const $ = await next.render$('/')
    expect($('#pure-value').text()).toBe('pure-value')
    expect((await fetchAsset('pure.txt')).toString()).toBe(
      'retained-after-tree-shaking'
    )
    if (isNextDev || isNextDeploy) return
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
  })

  it('does not build skipped dependencies solely for loader emissions in Turbopack', async () => {
    const $ = await next.render$('/')
    expect($('#transitive-value').text()).toBe('transitive-value')
    const response = await next.fetch(
      `/_next/static/media/transitive-sidecar.txt${next.getDeploymentIdQuery()}`
    )
    expect(response.status).toBe(isTurbopack ? 404 : 200)
    if (!isTurbopack) {
      expect(await response.text()).toBe('sidecar-transitive')
    }
  })

  it('preserves outputs of published ESM loaders from retained modules', async () => {
    const $ = await next.render$('/')
    expect($('#auto-value').text()).toBe('42')
    const declarations = (await fetchAsset('auto-imports.d.ts')).toString()
    expect(declarations).toContain('declare global')
    expect(declarations).toContain("typeof import('react').useState")
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
