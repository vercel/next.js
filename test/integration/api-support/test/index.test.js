/* global fixture, test */
import 'testcafe'

import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import {
  killApp,
  findPort,
  launchApp,
  fetchViaHTTP,
  renderViaHTTP,
  nextBuild,
  nextStart,
  File
} from 'next-test-utils'
import json from '../big.json'
import { createServer } from 'http'

const appDir = join(__dirname, '../')

function runTests (serverless = false) {
  test('should render page', async t => {
    const html = await renderViaHTTP(t.fixtureCtx.appPort, '/')
    await t.expect(html).match(/API - support/)
  })

  test('should return 404 for undefined path', async t => {
    const { status } = await fetchViaHTTP(
      t.fixtureCtx.appPort,
      '/api/not/unexisting/page/really',
      null,
      {}
    )
    await t.expect(status).eql(404)
  })

  test('should not conflict with /api routes', async t => {
    const port = await findPort()
    await nextBuild(appDir)
    const app = await nextStart(appDir, port)
    const res = await fetchViaHTTP(port, '/api-conflict')
    await t.expect(res.status).notEql(404)
    killApp(app)
  })

  test('should work with index api', async t => {
    if (serverless) {
      const port = await findPort()
      const resolver = require(join(appDir, '.next/serverless/pages/api.js'))
        .default

      const server = createServer(resolver).listen(port)
      const res = await fetchViaHTTP(port, '/api')
      const text = await res.text()
      server.close()

      await t.expect(text).eql('Index should work')
    } else {
      const text = await fetchViaHTTP(
        t.fixtureCtx.appPort,
        '/api',
        null,
        {}
      ).then(res => res.ok && res.text())

      await t.expect(text).eql('Index should work')
    }
  })

  test('should return custom error', async t => {
    const data = await fetchViaHTTP(
      t.fixtureCtx.appPort,
      '/api/error',
      null,
      {}
    )
    const json = await data.json()

    await t.expect(data.status).eql(500)
    await t.expect(json).eql({ error: 'Server error!' })
  })

  test('should throw Internal Server Error', async t => {
    const res = await fetchViaHTTP(
      t.fixtureCtx.appPort,
      '/api/user-error',
      null,
      {}
    )
    const text = await res.text()
    await t.expect(res.status).eql(500)
    await t.expect(text).eql('Internal Server Error')
  })

  test('should parse JSON body', async t => {
    const data = await fetchViaHTTP(t.fixtureCtx.appPort, '/api/parse', null, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify([{ title: 'Nextjs' }])
    }).then(res => res.ok && res.json())

    await t.expect(data).eql([{ title: 'Nextjs' }])
  })

  test('should return error with invalid JSON', async t => {
    const data = await fetchViaHTTP(t.fixtureCtx.appPort, '/api/parse', null, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: `{"message":Invalid"}`
    })
    await t.expect(data.status).eql(400)
    await t.expect(data.statusText).eql('Invalid JSON')
  })

  test('should return error exceeded body limit', async t => {
    const data = await fetchViaHTTP(t.fixtureCtx.appPort, '/api/parse', null, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(json)
    })

    await t.expect(data.status).eql(413)
    await t.expect(data.statusText).eql('Body exceeded 1mb limit')
  })

  test('should parse bigger body then 1mb', async t => {
    const data = await fetchViaHTTP(
      t.fixtureCtx.appPort,
      '/api/big-parse',
      null,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify(json)
      }
    )

    await t.expect(data.status).eql(200)
  })

  test('should parse urlencoded body', async t => {
    const body = {
      title: 'Nextjs',
      description: 'The React Framework for Production'
    }

    const formBody = Object.keys(body)
      .map(key => {
        return `${encodeURIComponent(key)}=${encodeURIComponent(body[key])}`
      })
      .join('&')

    const data = await fetchViaHTTP(t.fixtureCtx.appPort, '/api/parse', null, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-Form-urlencoded'
      },
      body: formBody
    }).then(res => res.ok && res.json())

    await t.expect(data).eql({
      title: 'Nextjs',
      description: 'The React Framework for Production'
    })
  })

  test('should parse body in handler', async t => {
    const data = await fetchViaHTTP(
      t.fixtureCtx.appPort,
      '/api/no-parsing',
      null,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify([{ title: 'Nextjs' }])
      }
    ).then(res => res.ok && res.json())

    await t.expect(data).eql([{ title: 'Nextjs' }])
  })

  test('should parse body with config', async t => {
    const data = await fetchViaHTTP(
      t.fixtureCtx.appPort,
      '/api/parsing',
      null,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify([{ title: 'Nextjs' }])
      }
    ).then(res => res.ok && res.json())

    await t.expect(data).eql({ message: 'Parsed body' })
  })

  test('should return empty cookies object', async t => {
    const data = await fetchViaHTTP(
      t.fixtureCtx.appPort,
      '/api/cookies',
      null,
      {}
    ).then(res => res.ok && res.json())
    await t.expect(data).eql({})
  })

  test('should return cookies object', async t => {
    const data = await fetchViaHTTP(
      t.fixtureCtx.appPort,
      '/api/cookies',
      null,
      {
        headers: {
          Cookie: 'nextjs=cool;'
        }
      }
    ).then(res => res.ok && res.json())
    await t.expect(data).eql({ nextjs: 'cool' })
  })

  test('should return 200 on POST on pages', async t => {
    const res = await fetchViaHTTP(t.fixtureCtx.appPort, '/user', null, {
      method: 'POST'
    })

    await t.expect(res.status).eql(200)
  })

  test('should return JSON on post on API', async t => {
    const data = await fetchViaHTTP(
      t.fixtureCtx.appPort,
      '/api/blog?title=Nextjs',
      null,
      {
        method: 'POST'
      }
    ).then(res => res.ok && res.json())

    await t.expect(data).eql([{ title: 'Nextjs' }])
  })

  test('should return data on dynamic route', async t => {
    const data = await fetchViaHTTP(
      t.fixtureCtx.appPort,
      '/api/post-1',
      null,
      {}
    ).then(res => res.ok && res.json())

    await t.expect(data).eql({ post: 'post-1' })
  })

  test('should work with dynamic params and search string', async t => {
    const data = await fetchViaHTTP(
      t.fixtureCtx.appPort,
      '/api/post-1?val=1',
      null,
      {}
    ).then(res => res.ok && res.json())

    await t.expect(data).eql({ val: '1', post: 'post-1' })
  })

  if (serverless) {
    test('should work with dynamic params and search string like lambda', async t => {
      await nextBuild(appDir, [])

      const port = await findPort()
      const resolver = require(join(
        appDir,
        '.next/serverless/pages/api/[post].js'
      )).default

      const server = createServer(resolver).listen(port)
      const res = await fetchViaHTTP(port, '/api/post-1?val=1')
      const json = await res.json()
      server.close()

      await t.expect(json).eql({ val: '1', post: 'post-1' })
    })
  }

  test('should prioritize a non-dynamic page', async t => {
    const data = await fetchViaHTTP(
      t.fixtureCtx.appPort,
      '/api/post-1/comments',
      null,
      {}
    ).then(res => res.ok && res.json())

    await t.expect(data).eql([{ message: 'Prioritize a non-dynamic api page' }])
  })

  test('should return data on dynamic nested route', async t => {
    const data = await fetchViaHTTP(
      t.fixtureCtx.appPort,
      '/api/post-1/comment-1',
      null,
      {}
    ).then(res => res.ok && res.json())

    await t.expect(data).eql({ post: 'post-1', comment: 'comment-1' })
  })

  test('should 404 on optional dynamic api page', async t => {
    const res = await fetchViaHTTP(
      t.fixtureCtx.appPort,
      '/api/blog/543/comment',
      null,
      {}
    )

    await t.expect(res.status).eql(404)
  })

  test('should build api routes', async t => {
    await nextBuild(appDir, [], { stdout: true })
    if (serverless) {
      const pagesManifest = JSON.parse(
        readFileSync(
          join(appDir, '.next/serverless/pages-manifest.json'),
          'utf8'
        )
      )
      await t.expect(Object.keys(pagesManifest).includes('/api/[post]')).ok()

      const port = await findPort()
      const resolver = require(join(
        appDir,
        '.next/serverless/pages/api/blog.js'
      )).default

      const server = createServer(resolver).listen(port)
      const res = await fetchViaHTTP(port, '/api/nextjs')
      const json = await res.json()
      server.close()

      await t.expect(json).eql([{ title: 'Cool Post!' }])
    } else {
      await t
        .expect(
          existsSync(join(appDir, '.next/server/pages-manifest.json'), 'utf8')
        )
        .ok()

      const buildManifest = JSON.parse(
        readFileSync(join(appDir, '.next/build-manifest.json'), 'utf8')
      )
      await t
        .expect(Object.keys(buildManifest.pages).includes('/api-conflict'))
        .ok()
    }
  })

  test('should return data on dynamic optional nested route', async t => {
    const data = await fetchViaHTTP(
      t.fixtureCtx.appPort,
      '/api/blog/post-1/comment/1',
      null,
      {}
    ).then(res => res.ok && res.json())

    await t.expect(data).eql({ post: 'post-1', id: '1' })
  })

  test('should compile only server code in development', async t => {
    await fetchViaHTTP(t.fixtureCtx.appPort, '/')
    await fetchViaHTTP(t.fixtureCtx.appPort, '/api/users')

    // Normal page
    await t
      .expect(
        existsSync(join(appDir, `/.next/static/development/pages/index.js`))
      )
      .ok()
    await t
      .expect(
        existsSync(
          join(appDir, `/.next/server/static/development/pages/index.js`)
        )
      )
      .ok()
    // API page
    await t
      .expect(
        existsSync(join(appDir, `/.next/static/development/pages/api/users.js`))
      )
      .notOk()
    await t
      .expect(
        existsSync(
          join(appDir, `/.next/server/static/development/pages/api/users.js`)
        )
      )
      .ok()
  })
}

fixture('API routes')
  .before(async ctx => {
    ctx.appPort = await findPort()
    ctx.server = await launchApp(appDir, ctx.appPort)
  })
  .after(ctx => killApp(ctx.server))

runTests()

const nextConfig = new File(join(appDir, 'next.config.js'))

fixture('Serverless support')
  .before(async ctx => {
    ctx.appPort = await findPort()
    ctx.server = await launchApp(appDir, ctx.appPort)
  })
  .after(ctx => killApp(ctx.server))
  .beforeEach(() => {
    nextConfig.replace('server', 'serverless')
  })
  .afterEach(() => {
    nextConfig.restore()
  })

runTests(true)
