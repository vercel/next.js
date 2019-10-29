/* global fixture, test */
import { t } from 'testcafe'

import { join } from 'path'
import cheerio from 'cheerio'
import { writeFile, remove } from 'fs-extra'
import {
  renderViaHTTP,
  nextBuild,
  findPort,
  launchApp,
  killApp,
  File
} from 'next-test-utils'

const appDir = join(__dirname, '..')

async function get$ (path, query) {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, path, query)
  return cheerio.load(html)
}

fixture('TypeScript Features')

fixture('default behavior')
  .before(async ctx => {
    ctx.output = ''
    const handleOutput = msg => {
      ctx.output += msg
    }
    ctx.appPort = await findPort()
    ctx.app = await launchApp(appDir, ctx.appPort, {
      onStdout: handleOutput,
      onStderr: handleOutput
    })
  })
  .after(ctx => killApp(ctx.app))

test('should render the page', async t => {
  const $ = await get$('/hello')
  await t.expect($('body').text()).match(/Hello World/)
})

test('should report type checking to stdout', async t => {
  await t
    .expect(t.fixtureCtx.output)
    .contains('waiting for typecheck results...')
})

test('should not fail to render when an inactive page has an error', async t => {
  await killApp(t.fixtureCtx.app)
  let evilFile = join(appDir, 'pages', 'evil.tsx')
  try {
    await writeFile(
      evilFile,
      `import React from 'react'

export default function EvilPage(): JSX.Element {
return <div notARealProp />
}
`
    )
    t.fixtureCtx.app = await launchApp(appDir, t.fixtureCtx.appPort)

    const $ = await get$('/hello')
    await t.expect($('body').text()).match(/Hello World/)
  } finally {
    await remove(evilFile)
  }
})

test('should compile the app', async t => {
  const output = await nextBuild(appDir, [], { stdout: true })
  await t.expect(output.stdout).match(/Compiled successfully/)
})

fixture('should compile with different types')

test('should compile async getInitialProps for _error', async t => {
  const errorPage = new File(join(appDir, 'pages/_error.tsx'))
  try {
    errorPage.replace('static ', 'static async ')
    const output = await nextBuild(appDir, [], { stdout: true })
    await t.expect(output.stdout).match(/Compiled successfully/)
  } finally {
    errorPage.restore()
  }
})
