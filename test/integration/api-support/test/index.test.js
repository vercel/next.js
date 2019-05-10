/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import {
  killApp,
  findPort,
  launchApp,
  fetchViaHTTP
  // renderViaHTTP,
} from 'next-test-utils'

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

  it('API request to undefined path', async () => {
    const { status } = await fetchViaHTTP(appPort, '/api/unexisting', null, {
      Accept: 'application/json'
    })
    expect(status).toEqual(404)
  })

  it('API request to list of users', async () => {
    const data = await fetchViaHTTP(appPort, '/api/users', null, {
      Accept: 'application/json'
    }).then(res => res.ok && res.json())

    expect(data).toEqual([{ name: 'Tim' }, { name: 'Jon' }])
  })

  it('API request to list of users with query parameter', async () => {
    const data = await fetchViaHTTP(appPort, '/api/users?name=Tim', null, {
      Accept: 'application/json'
    }).then(res => res.ok && res.json())

    expect(data).toEqual([{ name: 'Tim' }])
  })

  it('API request to nested posts', async () => {
    const data = await fetchViaHTTP(appPort, '/api/posts', null, {
      Accept: 'application/json'
    }).then(res => res.ok && res.json())

    expect(data).toEqual([{ title: 'Cool Post!' }])
  })
})
