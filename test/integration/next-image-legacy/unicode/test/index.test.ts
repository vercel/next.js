/* eslint-env jest */

import {
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import fetch from 'node-fetch'
import { join } from 'path'

const appDir = join(__dirname, '../')

let appPort
let app
let browser

function runTests() {
  it('should load static unicode image', async () => {
    const src = await browser.elementById('static').getAttribute('src')
    expect(src).toMatch(
      /_next%2Fstatic%2Fmedia%2F%C3%A4%C3%B6%C3%BC%C5%A1%C4%8D%C5%99%C3%AD(.+)png/
    )
    const fullSrc = new URL(src, `http://localhost:${appPort}`)
    const res = await fetch(fullSrc)
    expect(res.status).toBe(200)
  })

  it('should load internal unicode image', async () => {
    const src = await browser.elementById('internal').getAttribute('src')
    expect(src).toMatch(
      '/_next/image?url=%2F%C3%A4%C3%B6%C3%BC%C5%A1%C4%8D%C5%99%C3%AD.png'
    )
    const fullSrc = new URL(src, `http://localhost:${appPort}`)
    const res = await fetch(fullSrc)
    expect(res.status).toBe(200)
  })

  it('should load external unicode image', async () => {
    const src = await browser.elementById('external').getAttribute('src')
    expect(src).toMatch(
      '/_next/image?url=https%3A%2F%2Fimage-optimization-test.vercel.app%2F%C3%A4%C3%B6%C3%BC%C5%A1%C4%8D%C5%99%C3%AD.png'
    )
    const fullSrc = new URL(src, `http://localhost:${appPort}`)
    const res = await fetch(fullSrc)
    expect(res.status).toBe(200)
  })

  it('should load internal image with space', async () => {
    const src = await browser.elementById('internal-space').getAttribute('src')
    expect(src).toMatch('/_next/image?url=%2Fhello%2520world.jpg')
    const fullSrc = new URL(src, `http://localhost:${appPort}`)
    const res = await fetch(fullSrc)
    expect(res.status).toBe(200)
  })

  it('should load external image with space', async () => {
    const src = await browser.elementById('external-space').getAttribute('src')
    expect(src).toMatch(
      '/_next/image?url=https%3A%2F%2Fimage-optimization-test.vercel.app%2Fhello%2520world.jpg'
    )
    const fullSrc = new URL(src, `http://localhost:${appPort}`)
    const res = await fetch(fullSrc)
    expect(res.status).toBe(200)
  })
}

describe('Image Component Unicode Image URL', () => {
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        appPort = await findPort()
        app = await launchApp(appDir, appPort)
        browser = await webdriver(appPort, '/')
      })
      afterAll(async () => {
        await killApp(app)
        if (browser) {
          browser.close()
        }
      })
      runTests()
    }
  )
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        await nextBuild(appDir)
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
        browser = await webdriver(appPort, '/')
      })
      afterAll(async () => {
        await killApp(app)
        if (browser) {
          browser.close()
        }
      })
      runTests()
    }
  )
})
