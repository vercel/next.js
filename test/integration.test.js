/* global expect, jasmine, describe, test, beforeAll, afterAll */

'use strict'

import { join } from 'path'
import pkg from '../package.json'
import next from '../dist/server/next'
import {expectElement, setup, render, teardown} from 'next-test-helper'

let app = null
const dir = join(__dirname, 'fixtures', 'basic')

jasmine.DEFAULT_TIMEOUT_INTERVAL = 20000

describe('integration tests', () => {
  beforeAll(async () => {
    app = await setup(dir, next)
  })
  afterAll(async () => await teardown())

  test('renders a stateless component', async () => {
    const element = await render('/stateless')
    expect(element.find('meta').attr('class')).toMatch('next-head')
    expectElement(element.find('h1')).to.have.text('My component!')
  })

  test('renders a stateful component', async () => {
    const element = await render('/stateful')
    expectElement(element.find('div p')).to.have.text('The answer is 42')
  })

  test('header helper renders header information', async () => {
    const element = await (render('/head'))
    expect(element.find('meta[charset=iso-8859-5]').attr('class')).toMatch('next-head')
    expect(element.find('meta[content="my meta"]').attr('class')).toMatch('next-head')
    expectElement(element.find('div h1')).to.have.text('I can haz meta tags')
  })

  test('css helper renders styles', async () => {
    const element = await render('/css')
    const html = element.toString()
    expect(/\.css-\w+/.test(html)).toBeTruthy()
    expect(/<div class="css-\w+">This is red<\/div>/.test(html)).toBeTruthy()
  })

  test('renders styled jsx', async () => {
    const html = (await render('/styled-jsx')).toString()
    expect(html).toMatch(/<style id="__jsx-style-1401785258">p\[data-jsx="1401785258"] {color: blue }[^]+<\/style>/)
    expect(html.includes('<div data-jsx="1401785258"><p data-jsx="1401785258">This is blue</p></div>')).toBeTruthy()
  })

  test('renders properties populated asynchronously', async () => {
    const element = await render('/async-props')
    expectElement(element.find('p')).to.have.text('Diego Milito')
  })

  test('renders a link component', async () => {
    const html = (await render('/link')).toString()
    expect(html.includes('<a href="/about">About</a>')).toBeTruthy()
  })

  test('error', async () => {
    const html = (await render('/error')).toString()
    expect(html).toMatch(/<pre class=".+">Error: This is an expected error\n[^]+<\/pre>/)
  })

  test('error 404', async () => {
    const html = (await render('/non-existent')).toString()
    expect(html).toMatch(/<h1 data-jsx=".+">404<\/h1>/)
    expect(html).toMatch(/<h2 data-jsx=".+">This page could not be found\.<\/h2>/)
  })

  test('finishes response', async () => {
    const res = {
      finished: false,
      end () {
        this.finished = true
      }
    }
    const html = (await render('/finish-response', {}, {}, res)).toString()
    expect(html).toBeFalsy()
  })

  describe('X-Powered-By header', () => {
    test('set it by default', async () => {
      const req = { url: '/stateless' }
      const headers = {}
      const res = {
        setHeader (key, value) {
          headers[key] = value
        },
        end () {}
      }

      await app.render(req, res, req.url)
      expect(headers['X-Powered-By']).toEqual(`Next.js ${pkg.version}`)
    })

    test('do not set it when poweredByHeader==false', async () => {
      const req = { url: '/stateless' }
      const originalConfigValue = app.config.poweredByHeader
      app.config.poweredByHeader = false
      const res = {
        setHeader (key, value) {
          if (key === 'X-Powered-By') {
            throw new Error('Should not set the X-Powered-By header')
          }
        },
        end () {}
      }

      await app.render(req, res, req.url)
      app.config.poweredByHeader = originalConfigValue
    })
  })
})
