/* eslint-env jest */

import { join } from 'path'
import { createServer as createHttpServer } from 'http'
import { createServer as createHttpsServer } from 'https'
import {
  fetchViaHTTP,
  nextBuild,
  findPort,
  nextStart,
  killApp,
} from 'next-test-utils'
import webdriver from 'next-webdriver'

jest.setTimeout(1000 * 60 * 1)

const appDir = join(__dirname, '../')

let appPort
let app
let server1
let server2

describe('node-fetch-keep-alive', () => {
  let output = ''

  beforeAll(async () => {
    const t = 1000
    server1 = createHttpServer((_, res) => res.end('Mock HTTP response'))
    server1.keepAliveTimeout = t
    server1.on('error', (err) => console.error('Mock HTTP error', err))
    server1.on('connection', (socket) => socket.setTimeout(t + 500))
    server1.listen(44001)
    // server2 = createHttpsServer((_, res) => res.end('Mock HTTPS response'));
    // server2.keepAliveTimeout = t;
    // server2.on('error', err => console.error('Mock HTTPS error', err));
    // server2.on('connection', socket => socket.setTimeout(t+300));
    // server2.listen(44002)
    const { stdout, stderr } = await nextBuild(appDir, [], {
      stdout: true,
      stderr: true,
    })
    output = (stderr || '') + (stdout + '')
    if (stdout) console.log(stdout)
    if (stderr) console.error(stderr)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
  })
  afterAll(async () => {
    await killApp(app)
    server1.close()
    //server2.close();
  })

  it('should keep-alive for json API', async () => {
    const res = await fetchViaHTTP(appPort, '/api/json')
    const obj = await res.json()
    expect(obj).toBe({ text1: 'Mock HTTP response', connection1: 'keep-alive' })
  })

  it('should keep-alive for getStaticProps', async () => {
    const browser = await webdriver(appPort, '/ssg')
    const props = await browser.elementById('props').text()
    const obj = JSON.parse(props)
    expect(obj).toBe({ text1: 'Mock HTTP response', connection1: 'keep-alive' })
    await browser.close()
  })

  it('should keep-alive for getServerSideProps', async () => {
    const browser = await webdriver(appPort, '/ssr')
    const props = await browser.elementById('props').text()
    const obj = JSON.parse(props)
    expect(obj).toBe({ text1: 'Mock HTTP response', connection1: 'keep-alive' })
    await browser.close()
  })
})
