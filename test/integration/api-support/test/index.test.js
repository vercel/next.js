/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import { existsSync } from 'fs'
import {
  killApp,
  findPort,
  launchApp,
  fetchViaHTTP,
  renderViaHTTP
} from 'next-test-utils'
import json from '../big.json'

const appDir = join(__dirname, '../')
let appPort
let server
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

describe('API support', () => {
  beforeAll(async () => {
    appPort = await findPort()
    server = await launchApp(appDir, appPort)
  })
  afterAll(() => killApp(server))

  it('should return 404 for undefined path', async () => {
    const { status } = await fetchViaHTTP(appPort, '/api/unexisting', null, {})
    expect(status).toEqual(404)
  })

  it('should render page', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/API - support/)
  })

  it('should return JSON of unfiltered users', async () => {
    const data = await fetchViaHTTP(appPort, '/api/users', null, {}).then(
      res => res.ok && res.json()
    )

    expect(data).toEqual([{ name: 'Tim' }, { name: 'Jon' }])
  })

  it('should return JSON list of filtered users', async () => {
    const data = await fetchViaHTTP(
      appPort,
      '/api/users?name=Tim',
      null,
      {}
    ).then(res => res.ok && res.json())

    expect(data).toEqual([{ name: 'Tim' }])
  })

  it('should return JSON for nested API endpoints', async () => {
    const data = await fetchViaHTTP(appPort, '/api/posts', null, {}).then(
      res => res.ok && res.json()
    )

    expect(data).toEqual([{ title: 'Cool Post!' }])
  })

  it('should return 404 on POST on pages', async () => {
    const data = await fetchViaHTTP(appPort, '/users', null, {
      method: 'POST'
    }).then(res => res.status)

    expect(data).toEqual(404)
  })

  it('should return JSON on post on API', async () => {
    const data = await fetchViaHTTP(appPort, '/api/posts?title=Nextjs', null, {
      method: 'POST'
    }).then(res => res.ok && res.json())

    expect(data).toEqual([{ title: 'Nextjs' }])
  })

  it('should parse JSON body', async () => {
    const data = await fetchViaHTTP(appPort, '/api/parse', null, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify([{ title: 'Nextjs' }])
    }).then(res => res.ok && res.json())

    expect(data).toEqual([{ title: 'Nextjs' }])
  })

  it('shuld return error with invalid JSON', async () => {
    const data = await fetchViaHTTP(appPort, '/api/parse', null, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: `{"message":Invalid"}`
    })
    expect(data.status).toEqual(400)
    expect(data.statusText).toEqual('Invalid JSON')
  })

  it('should return error exceeded body limit', async () => {
    const data = await fetchViaHTTP(appPort, '/api/parse', null, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(json)
    })

    expect(data.status).toEqual(413)
    expect(data.statusText).toEqual('Body exceeded 1mb limit')
  })

  it('should parse urlencoded body', async () => {
    const body = {
      title: 'Nextjs',
      description: 'The React Framework for Production'
    }

    const formBody = Object.keys(body)
      .map(key => {
        return `${encodeURIComponent(key)}=${encodeURIComponent(body[key])}`
      })
      .join('&')

    const data = await fetchViaHTTP(appPort, '/api/parse', null, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-Form-urlencoded'
      },
      body: formBody
    }).then(res => res.ok && res.json())

    expect(data).toEqual({
      title: 'Nextjs',
      description: 'The React Framework for Production'
    })
  })

  it('should return custom error', async () => {
    const data = await fetchViaHTTP(appPort, '/api/error', null, {})
    const json = await data.json()

    expect(data.status).toEqual(500)
    expect(json).toEqual({ error: 'Server error!' })
  })

  it('should return empty cookies object', async () => {
    const data = await fetchViaHTTP(appPort, '/api/cookies', null, {}).then(
      res => res.ok && res.json()
    )
    expect(data).toEqual({})
  })

  it('should return cookies object', async () => {
    const data = await fetchViaHTTP(appPort, '/api/cookies', null, {
      headers: {
        Cookie: 'nextjs=cool;'
      }
    }).then(res => res.ok && res.json())
    expect(data).toEqual({ nextjs: 'cool' })
  })

  it('should compile only server code in development', async () => {
    await fetchViaHTTP(appPort, '/')
    await fetchViaHTTP(appPort, '/api/posts')

    // Normal page
    expect(
      existsSync(join(appDir, `/.next/static/development/pages/index.js`))
    ).toBeTruthy()
    expect(
      existsSync(
        join(appDir, `/.next/server/static/development/pages/index.js`)
      )
    ).toBeTruthy()
    // API page
    expect(
      existsSync(join(appDir, `/.next/static/development/pages/api/posts.js`))
    ).toBeFalsy()
    expect(
      existsSync(
        join(appDir, `/.next/server/static/development/pages/api/posts.js`)
      )
    ).toBeTruthy()
  })
})
