/* global fixture, test */
import 'testcafe'

import { join } from 'path'
import { readdir, readFile, remove } from 'fs-extra'
import {
  findPort,
  nextBuild,
  launchApp,
  killApp,
  nextServer,
  startApp,
  stopApp,
  File,
  waitFor,
  renderViaHTTP
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import cheerio from 'cheerio'

const fixturesDir = join(__dirname, '..', 'fixtures')

fixture('CSS Support')

fixture('Basic Global Support').before(async ctx => {
  ctx.appDir = join(fixturesDir, 'single-global')
  await remove(join(ctx.appDir, '.next'))
})

test('should build successfully', async t => {
  await nextBuild(t.fixtureCtx.appDir)
})

test(`should've emitted a single CSS file`, async t => {
  const cssFolder = join(t.fixtureCtx.appDir, '.next/static/css')

  const files = await readdir(cssFolder)
  const cssFiles = files.filter(f => /\.css$/.test(f))

  await t.expect(cssFiles.length).eql(1)
  await t
    .expect(await readFile(join(cssFolder, cssFiles[0]), 'utf8'))
    .contains('color:red')
})

fixture('Basic Global Support with src/ dir').before(async ctx => {
  ctx.appDir = join(fixturesDir, 'single-global-src')
  await remove(join(ctx.appDir, '.next'))
})

test('should build successfully', async t => {
  await nextBuild(t.fixtureCtx.appDir)
})

test(`should've emitted a single CSS file`, async t => {
  const cssFolder = join(t.fixtureCtx.appDir, '.next/static/css')

  const files = await readdir(cssFolder)
  const cssFiles = files.filter(f => /\.css$/.test(f))

  await t.expect(cssFiles.length).eql(1)
  await t
    .expect(await readFile(join(cssFolder, cssFiles[0]), 'utf8'))
    .contains('color:red')
})

fixture('Multi Global Support').before(async ctx => {
  ctx.appDir = join(fixturesDir, 'multi-global')
  await remove(join(ctx.appDir, '.next'))
})

test('should build successfully', async t => {
  await nextBuild(t.fixtureCtx.appDir)
})

test(`should've emitted a single CSS file`, async t => {
  const cssFolder = join(t.fixtureCtx.appDir, '.next/static/css')

  const files = await readdir(cssFolder)
  const cssFiles = files.filter(f => /\.css$/.test(f))

  await t.expect(cssFiles.length).eql(1)
  const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')
  await t
    .expect(cssContent.replace(/\/\*.*?\*\//g, '').trim())
    .contains(`.red-text{color:red}.blue-text{color:#00f}`)
})

fixture('Nested @import() Global Support').before(async ctx => {
  ctx.appDir = join(fixturesDir, 'nested-global')
  await remove(join(ctx.appDir, '.next'))
})

test('should build successfully', async t => {
  await nextBuild(t.fixtureCtx.appDir)
})

test(`should've emitted a single CSS file`, async t => {
  const cssFolder = join(t.fixtureCtx.appDir, '.next/static/css')

  const files = await readdir(cssFolder)
  const cssFiles = files.filter(f => /\.css$/.test(f))

  await t.expect(cssFiles.length).eql(1)
  const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')
  await t
    .expect(cssContent.replace(/\/\*.*?\*\//g, '').trim())
    .contains(
      `.red-text{color:purple;font-weight:bolder;color:red}.blue-text{color:orange;font-weight:bolder;color:#00f}`
    )
})

fixture('CSS Compilation and Prefixing').before(async ctx => {
  ctx.appDir = join(fixturesDir, 'compilation-and-prefixing')
  await remove(join(ctx.appDir, '.next'))
})

test('should build successfully', async t => {
  await nextBuild(t.fixtureCtx.appDir)
})

test(`should've compiled and prefixed`, async t => {
  const cssFolder = join(t.fixtureCtx.appDir, '.next/static/css')

  const files = await readdir(cssFolder)
  const cssFiles = files.filter(f => /\.css$/.test(f))

  await t.expect(cssFiles.length).eql(1)
  const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')
  await t
    .expect(cssContent.replace(/\/\*.*?\*\//g, '').trim())
    .contains(
      `@media (min-width:480px) and (max-width:767px){::-webkit-input-placeholder{color:green}::-moz-placeholder{color:green}:-ms-input-placeholder{color:green}::-ms-input-placeholder{color:green}::placeholder{color:green}}`
    )

  // Contains a source map
  await t.expect(cssContent).match(/\/\*#\s*sourceMappingURL=(.+\.map)\s*\*\//)
})

test(`should've emitted a source map`, async t => {
  const cssFolder = join(t.fixtureCtx.appDir, '.next/static/css')

  const files = await readdir(cssFolder)
  const cssMapFiles = files.filter(f => /\.css\.map$/.test(f))

  await t.expect(cssMapFiles.length).eql(1)
  const cssMapContent = (await readFile(
    join(cssFolder, cssMapFiles[0]),
    'utf8'
  )).trim()

  const { version, mappings, sourcesContent } = JSON.parse(
    cssMapContent.replace(/\r\n/g, '\n')
  )
  await t.expect({ version, mappings, sourcesContent }).eql({
    mappings:
      'AAAA,+CACE,4BACE,WACF,CAFA,mBACE,WACF,CAFA,uBACE,WACF,CAFA,wBACE,WACF,CAFA,cACE,WACF,CACF',
    sourcesContent: [
      '@media (480px <= width < 768px) {\n  ::placeholder {\n    color: green;\n  }\n}\n'
    ],
    version: 3
  })
})

// Tests css ordering
fixture('Multi Global Support (reversed)').before(async ctx => {
  ctx.appDir = join(fixturesDir, 'multi-global-reversed')
  await remove(join(ctx.appDir, '.next'))
})

test('should build successfully', async t => {
  await nextBuild(t.fixtureCtx.appDir)
})

test(`should've emitted a single CSS file`, async t => {
  const cssFolder = join(t.fixtureCtx.appDir, '.next/static/css')

  const files = await readdir(cssFolder)
  const cssFiles = files.filter(f => /\.css$/.test(f))

  await t.expect(cssFiles.length).eql(1)
  const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')
  await t
    .expect(cssContent.replace(/\/\*.*?\*\//g, '').trim())
    .contains(`.blue-text{color:#00f}.red-text{color:red}`)
})

fixture('Invalid Global CSS').before(async ctx => {
  ctx.appDir = join(fixturesDir, 'invalid-global')
  await remove(join(ctx.appDir, '.next'))
})

test('should fail to build', async t => {
  const { stderr } = await nextBuild(t.fixtureCtx.appDir, [], {
    stderr: true
  })
  await t.expect(stderr).contains('Failed to compile')
  await t.expect(stderr).contains('styles/global.css')
  await t
    .expect(stderr)
    .match(/Please move all global CSS imports.*?pages(\/|\\)_app/)
})

fixture('Invalid Global CSS with Custom App').before(async ctx => {
  ctx.appDir = join(fixturesDir, 'invalid-global-with-app')
  await remove(join(ctx.appDir, '.next'))
})

test('should fail to build', async t => {
  const { stderr } = await nextBuild(t.fixtureCtx.appDir, [], {
    stderr: true
  })
  await t.expect(stderr).contains('Failed to compile')
  await t.expect(stderr).contains('styles/global.css')
  await t
    .expect(stderr)
    .match(/Please move all global CSS imports.*?pages(\/|\\)_app/)
})

fixture('Valid and Invalid Global CSS with Custom App').before(async ctx => {
  ctx.appDir = join(fixturesDir, 'valid-and-invalid-global')
  await remove(join(ctx.appDir, '.next'))
})

test('should fail to build', async t => {
  const { stderr } = await nextBuild(t.fixtureCtx.appDir, [], {
    stderr: true
  })
  await t.expect(stderr).contains('Failed to compile')
  await t.expect(stderr).contains('styles/global.css')
  await t.expect(stderr).contains('Please move all global CSS imports')
})

fixture('Can hot reload CSS without losing state')
  .before(async ctx => {
    ctx.appDir = join(fixturesDir, 'multi-page')
    await remove(join(ctx.appDir, '.next'))
    ctx.appPort = await findPort()
    ctx.app = await launchApp(ctx.appDir, ctx.appPort)
  })
  .after(async ctx => {
    await killApp(ctx.app)
  })

test('should update CSS color without remounting <input>', async t => {
  let browser
  try {
    browser = await webdriver(t.fixtureCtx.appPort, '/page1')
    await waitFor(2000) // ensure application hydrates

    const desiredText = 'hello world'
    await browser.elementByCss('#text-input').type(desiredText)
    await t
      .expect(await browser.elementByCss('#text-input').getValue())
      .eql(desiredText)

    const currentColor = await browser.eval(
      `window.getComputedStyle(document.querySelector('.red-text')).color`
    )
    await t.expect(currentColor).contains(`rgb(255, 0, 0)`)

    const cssFile = new File(join(t.fixtureCtx.appDir, 'styles/global1.css'))
    try {
      cssFile.replace('color: red', 'color: purple')
      await waitFor(2000) // wait for HMR

      const refreshedColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('.red-text')).color`
      )
      await t.expect(refreshedColor).contains(`rgb(128, 0, 128)`)

      // ensure text remained
      await t
        .expect(await browser.elementByCss('#text-input').getValue())
        .eql(desiredText)
    } finally {
      cssFile.restore()
    }
  } finally {
    if (browser) {
      await browser.close()
    }
  }
})

fixture('Has CSS in computed styles in Development')
  .before(async ctx => {
    const appDir = join(fixturesDir, 'multi-page')
    await remove(join(appDir, '.next'))
    ctx.appPort = await findPort()
    ctx.app = await launchApp(appDir, ctx.appPort)
  })
  .after(async ctx => {
    await killApp(ctx.app)
  })

test('should have CSS for page', async t => {
  let browser
  try {
    browser = await webdriver(t.fixtureCtx.appPort, '/page2')

    const currentColor = await browser.eval(
      `window.getComputedStyle(document.querySelector('.blue-text')).color`
    )
    await t.expect(currentColor).contains(`rgb(0, 0, 255)`)
  } finally {
    if (browser) {
      await browser.close()
    }
  }
})

fixture('Body is not hidden when unused in Development')
  .before(async ctx => {
    const appDir = join(fixturesDir, 'unused')
    await remove(join(appDir, '.next'))
    ctx.appPort = await findPort()
    ctx.app = await launchApp(appDir, ctx.appPort)
  })
  .after(async ctx => {
    await killApp(ctx.app)
  })

test('should have body visible', async t => {
  let browser
  try {
    browser = await webdriver(t.fixtureCtx.appPort, '/')
    const currentDisplay = await browser.eval(
      `window.getComputedStyle(document.querySelector('body')).display`
    )
    await t.expect(currentDisplay).eql('block')
  } finally {
    if (browser) {
      await browser.close()
    }
  }
})

fixture('Body is not hidden when broken in Development')
  .before(async ctx => {
    ctx.appDir = join(fixturesDir, 'unused')
    await remove(join(ctx.appDir, '.next'))
    ctx.appPort = await findPort()
    ctx.app = await launchApp(ctx.appDir, ctx.appPort)
  })
  .after(async ctx => {
    await killApp(ctx.app)
  })

test('should have body visible', async t => {
  const pageFile = new File(join(t.fixtureCtx.appDir, 'pages/index.js'))
  let browser
  try {
    pageFile.replace('<div />', '<div>')
    await waitFor(2000) // wait for recompile

    browser = await webdriver(t.fixtureCtx.appPort, '/')
    const currentDisplay = await browser.eval(
      `window.getComputedStyle(document.querySelector('body')).display`
    )
    await t.expect(currentDisplay).eql('block')
  } finally {
    pageFile.restore()
    if (browser) {
      await browser.close()
    }
  }
})

fixture('Has CSS in computed styles in Production')
  .before(async ctx => {
    const appDir = join(fixturesDir, 'multi-page')
    await remove(join(appDir, '.next'))
    await nextBuild(appDir)

    ctx.server = nextServer({
      dir: appDir,
      dev: false,
      quiet: true
    })

    ctx.app = await startApp(ctx.server)
    ctx.appPort = ctx.app.address().port
  })
  .after(async ctx => {
    await stopApp(ctx.app)
  })

test('should have CSS for page', async t => {
  let browser
  try {
    browser = await webdriver(t.fixtureCtx.appPort, '/page2')

    const currentColor = await browser.eval(
      `window.getComputedStyle(document.querySelector('.blue-text')).color`
    )
    await t.expect(currentColor).contains(`rgb(0, 0, 255)`)
  } finally {
    if (browser) {
      await browser.close()
    }
  }
})

test(`should've preloaded the CSS file and injected it in <head>`, async t => {
  const content = await renderViaHTTP(t.fixtureCtx.appPort, '/page2')
  const $ = cheerio.load(content)

  const cssPreload = $('link[rel="preload"][as="style"]')
  await t.expect(cssPreload.length).eql(1)
  await t
    .expect(cssPreload.attr('href'))
    .match(/^\/_next\/static\/css\/.*\.css$/)

  const cssSheet = $('link[rel="stylesheet"]')
  await t.expect(cssSheet.length).eql(1)
  await t.expect(cssSheet.attr('href')).match(/^\/_next\/static\/css\/.*\.css$/)
})

fixture('CSS URL via `file-loader').before(async ctx => {
  ctx.appDir = join(fixturesDir, 'url-global')
  await remove(join(ctx.appDir, '.next'))
})

test('should build successfully', async t => {
  await nextBuild(t.fixtureCtx.appDir)
})

test(`should've emitted expected files`, async t => {
  const cssFolder = join(t.fixtureCtx.appDir, '.next/static/css')
  const mediaFolder = join(t.fixtureCtx.appDir, '.next/static/media')

  const files = await readdir(cssFolder)
  const cssFiles = files.filter(f => /\.css$/.test(f))

  await t.expect(cssFiles.length).eql(1)
  const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')
  await t
    .expect(cssContent.replace(/\/\*.*?\*\//g, '').trim())
    .match(
      /^\.red-text\{color:red;background-image:url\(static\/media\/dark\.[a-z0-9]{32}\.svg\) url\(static\/media\/dark2\.[a-z0-9]{32}\.svg\)\}\.blue-text\{color:orange;font-weight:bolder;background-image:url\(static\/media\/light\.[a-z0-9]{32}\.svg\);color:#00f\}$/
    )

  const mediaFiles = await readdir(mediaFolder)
  await t.expect(mediaFiles.length).eql(3)
  await t
    .expect(
      mediaFiles
        .map(fileName =>
          /^(.+?)\..{32}\.(.+?)$/
            .exec(fileName)
            .slice(1)
            .join('.')
        )
        .sort()
    )
    .eql(['dark.svg', 'dark2.svg', 'light.svg'])
})

fixture('Ordering with styled-jsx (dev)')
  .before(async ctx => {
    const appDir = join(fixturesDir, 'with-styled-jsx')
    await remove(join(appDir, '.next'))
    ctx.appPort = await findPort()
    ctx.app = await launchApp(appDir, ctx.appPort)
  })
  .after(async ctx => {
    await killApp(ctx.app)
  })

test('should have the correct color (css ordering)', async t => {
  let browser
  try {
    browser = await webdriver(t.fixtureCtx.appPort, '/')
    await waitFor(2000) // ensure application hydrates

    const currentColor = await browser.eval(
      `window.getComputedStyle(document.querySelector('.my-text')).color`
    )
    await t.expect(currentColor).contains(`rgb(0, 128, 0)`)
  } finally {
    if (browser) {
      await browser.close()
    }
  }
})

fixture('Ordering with styled-jsx (prod)')
  .before(async ctx => {
    const appDir = join(fixturesDir, 'with-styled-jsx')
    await remove(join(appDir, '.next'))

    await nextBuild(appDir)
    ctx.server = nextServer({
      dir: appDir,
      dev: false,
      quiet: true
    })

    ctx.app = await startApp(ctx.server)
    ctx.appPort = ctx.app.address().port
  })
  .after(async ctx => {
    await stopApp(ctx.app)
  })

test('should have the correct color (css ordering)', async t => {
  let browser
  try {
    browser = await webdriver(t.fixtureCtx.appPort, '/')
    await waitFor(2000) // ensure application hydrates

    const currentColor = await browser.eval(
      `window.getComputedStyle(document.querySelector('.my-text')).color`
    )
    await t.expect(currentColor).contains(`rgb(0, 128, 0)`)
  } finally {
    if (browser) {
      await browser.close()
    }
  }
})
