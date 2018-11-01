/* eslint-env jest */
/* global page, browser, server */
import fsTimeMachine from 'fs-time-machine'
import { getReactErrorOverlayContent } from 'puppet-helper'

import { join } from 'path'

it('should recover from 404 after a page has been added', async () => {
  const newPage = await fsTimeMachine(join(__dirname, '../pages/hmr/new-page.js'))
  await page.goto(server.getURL('/hmr/new-page'))
  await expect(page).toMatch('This page could not be found')

  await newPage.write('export default () => (<div id="new-page">the-new-page</div>)')
  await page.waitForNavigation()
  await expect(page).toMatchElement('div', {
    text: 'the-new-page'
  })

  await newPage.restore()
  await page.waitForNavigation()
  await expect(page).toMatch('This page could not be found')
  await page.goto('about:blank')
})

it('should have installed the react-overlay-editor editor handler', async () => {
  const page = await browser.newPage()
  const aboutPage = await fsTimeMachine(join(__dirname, '../pages/hmr/about.js'))
  await page.goto(server.getURL('/hmr/about'))

  await expect(page).toMatch('This is the about page')
  await aboutPage.replace('</div>', 'div')

  // react-error-overlay uses the following inline style if an editorHandler is installed
  await page.waitForNavigation({ waitUntil: 'networkidle2' })
  const reactErrorOverlayContent = await getReactErrorOverlayContent(page)
  expect(reactErrorOverlayContent).toMatch(/style="cursor: pointer;"/)

  await aboutPage.restore()
  await expect(page).toMatch('This is the about page')

  await page.goto('about:blank')
  await page.close()
})

it('should show the error on all pages', async () => {
  const page = await browser.newPage()
  const aboutPage = await fsTimeMachine(join(__dirname, '../pages/hmr/about.js'))

  await aboutPage.replace('</div>', 'div')
  await page.goto(server.getURL('/hmr/contact'))

  const reactErrorOverlayContent = await getReactErrorOverlayContent(page)
  expect(reactErrorOverlayContent).toMatch(/Unterminated JSX contents/)

  await aboutPage.restore()

  await page.waitForNavigation()
  await expect(page).toMatchElement('div', {
    text: 'This is the contact page'
  })

  await page.goto('about:blank')
  await page.close()
})

it('should detect syntax errors and recover', async () => {
  const page = await browser.newPage()
  const aboutPage = await fsTimeMachine(join(__dirname, '../pages/hmr/about.js'))
  await page.goto(server.getURL('/hmr/about'))

  await expect(page).toMatchElement('div', {
    text: 'This is the about page.'
  })

  await aboutPage.replace('</div>', 'div')
  await page.waitForNavigation({ waitUntil: 'networkidle2' })
  const reactErrorOverlayContent = await getReactErrorOverlayContent(page)
  expect(reactErrorOverlayContent).toMatch(/Unterminated JSX contents/)

  await aboutPage.restore()
  await expect(page).toMatchElement('div', {
    text: 'This is the about page.'
  })

  await page.goto('about:blank')
  await page.close()
})

it('should detect runtime errors on the module scope', async () => {
  const page = await browser.newPage()
  const aboutPage = await fsTimeMachine(join(__dirname, '../pages/hmr/about.js'))
  await page.goto(server.getURL('/hmr/about'))
  await expect(page).toMatchElement('div', {
    text: 'This is the about page.'
  })

  await aboutPage.replace('export', 'aa=20;\nexport')
  const reactErrorOverlayContent = await getReactErrorOverlayContent(page)
  expect(reactErrorOverlayContent).toMatch(/aa is not defined/)

  await aboutPage.restore()
  await page.waitForNavigation({ waitUntil: 'networkidle2' })
  await expect(page).toMatchElement('div', {
    text: 'This is the about page.'
  })

  await page.goto('about:blank')
  await page.close()
})

it('should recover from errors in the render function', async () => {
  const page = await browser.newPage()
  const aboutPage = await fsTimeMachine(join(__dirname, '../pages/hmr/about.js'))
  await page.goto(server.getURL('/hmr/about'))
  await expect(page).toMatchElement('div', {
    text: 'This is the about page.'
  })

  await aboutPage.replace('return', 'throw new Error("an-expected-error");\nreturn')
  const reactErrorOverlayContent = await getReactErrorOverlayContent(page)
  expect(reactErrorOverlayContent).toMatch(/an-expected-error/)

  await aboutPage.restore()
  await page.waitForNavigation({ waitUntil: 'networkidle2' })
  await expect(page).toMatchElement('div', {
    text: 'This is the about page.'
  })

  await page.goto('about:blank')
  await page.close()
})

it('should recover after exporting an invalid page', async () => {
  const page = await browser.newPage()
  const aboutPage = await fsTimeMachine(join(__dirname, '../pages/hmr/about.js'))
  await page.goto(server.getURL('/hmr/about'))
  await expect(page).toMatchElement('div', {
    text: 'This is the about page.'
  })

  await aboutPage.replace('export default', 'export default "not-a-page"\nexport const fn = ')
  await page.waitForNavigation({ waitUntil: 'networkidle2' })
  expect(page).toMatch(/The default export is not a React Component/)

  await aboutPage.restore()
  await page.waitForNavigation({ waitUntil: 'networkidle2' })
  await expect(page).toMatchElement('div', {
    text: 'This is the about page.'
  })

  await page.goto('about:blank')
  await page.close()
})

it('should recover after a bad return from the render function', async () => {
  const page = await browser.newPage()
  const aboutPage = await fsTimeMachine(join(__dirname, '../pages/hmr/about.js'))
  await page.goto(server.getURL('/hmr/about'))
  await expect(page).toMatchElement('div', {
    text: 'This is the about page.'
  })

  await aboutPage.replace('export default', 'export default () => /search/ \nexport const fn = ')
  const reactErrorOverlayContent = await getReactErrorOverlayContent(page)
  expect(reactErrorOverlayContent).toMatch(/Objects are not valid as a React child/)

  await aboutPage.restore()
  await page.waitForNavigation({ waitUntil: 'networkidle2' })
  await expect(page).toMatchElement('div', {
    text: 'This is the about page.'
  })

  await page.goto('about:blank')
  await page.close()
})

it('should recover from errors in getInitialProps in client', async () => {
  const page = await browser.newPage()
  const erroredPage = await fsTimeMachine(join(__dirname, '../pages/hmr/error-in-gip.js'))
  await page.goto(server.getURL('/hmr'))

  await expect(page).toClick('#error-in-gip-link')
  const reactErrorOverlayContent = await getReactErrorOverlayContent(page)
  expect(reactErrorOverlayContent).toMatch(/an-expected-error-in-gip/)

  await erroredPage.replace('throw error', 'return {}')
  await page.waitForNavigation({ waitUntil: 'networkidle2' })
  await expect(page).toMatchElement('div', {
    text: 'Hello'
  })
  await erroredPage.restore()

  await page.goto('about:blank')
  await page.close()
})

it('should recover after an error reported via SSR', async () => {
  const page = await browser.newPage()
  const erroredPage = await fsTimeMachine(join(__dirname, '../pages/hmr/error-in-gip.js'))
  await page.goto(server.getURL('/hmr/error-in-gip'))

  const reactErrorOverlayContent = await getReactErrorOverlayContent(page)
  expect(reactErrorOverlayContent).toMatch(/an-expected-error-in-gip/)

  await erroredPage.replace('throw error', 'return {}')
  await page.waitForNavigation({ waitUntil: 'networkidle2' })
  await expect(page).toMatch('Hello')

  await erroredPage.restore()

  await page.goto('about:blank')
  await page.close()
})
