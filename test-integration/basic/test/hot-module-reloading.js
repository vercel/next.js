/* eslint-env jest */
/* global page, server */
import { join } from 'path'
import fsTimeMachine from 'fs-time-machine'

describe('delete a page and add it back', () => {
  it('should load the page properly', async () => {
    const contactPage = await fsTimeMachine(join(__dirname, '../pages/hmr/contact.js'))
    await page.goto(server.getURL('/hmr/contact'))
    await expect(page).toMatchElement('p', {
      text: 'This is the contact page.'
    })
    await contactPage.delete()
    await page.waitForNavigation({ waitUntil: 'networkidle2' })
    await expect(page).toMatch('This page could not be found.')
    await contactPage.restore()
    await page.waitForNavigation({ waitUntil: 'networkidle2' })
    await expect(page).toMatchElement('p', {
      text: 'This is the contact page.'
    })
    await page.goto('about:blank')
  })
})

describe('editing a page', () => {
  it('should detect the changes and display it', async () => {
    const aboutPage = await fsTimeMachine(join(__dirname, '../pages/hmr/about.js'))
    await page.goto(server.getURL('/hmr/about'))
    await expect(page).toMatchElement('p', {
      text: 'This is the about page.'
    })

    await aboutPage.replace('This is the about page', 'COOL page')
    await expect(page).toMatchElement('p', {
      text: 'COOL page.'
    })
    await aboutPage.restore()
    await expect(page).toMatchElement('p', {
      text: 'This is the about page.'
    })
    await page.goto('about:blank')
  })

  it('should not reload unrelated pages', async () => {
    const aboutPage = await fsTimeMachine(join(__dirname, '../pages/hmr/about.js'))
    await page.goto(server.getURL('/hmr/counter'))

    await expect(page).toClick('button')
    await expect(page).toClick('button')
    await expect(page).toMatchElement('p', {
      text: 'COUNT: 2'
    })

    aboutPage.replace('This is the about page', 'COOL page')
    await page.waitFor(2000)
    await expect(page).toMatchElement('p', {
      text: 'COUNT: 2'
    })

    await aboutPage.restore()
    await page.waitFor(2000)
    await expect(page).toMatchElement('p', {
      text: 'COUNT: 2'
    })

    await page.goto('about:blank')
  })

  // Added because of a regression in react-hot-loader, see issues: #4246 #4273
  // Also: https://github.com/zeit/styled-jsx/issues/425
  it('should update styles correctly', async () => {
    const stylePage = await fsTimeMachine(join(__dirname, '../pages/hmr/style.js'))
    await page.goto(server.getURL('/hmr/style'))
    const pTag = await expect(page).toMatchElement('.hmr-style-page p')
    const initialFontSize = await page.evaluate(e => window.getComputedStyle(e).getPropertyValue('font-size'), pTag)
    expect(initialFontSize).toBe('100px')

    await stylePage.replace('100px', '200px')
    await page.waitForRequest(request => /\.hot-update\.js$/.test(request.url()))

    const editedPTag = await expect(page).toMatchElement('.hmr-style-page p')
    const editedFontSize = await page.evaluate(e => window.getComputedStyle(e).getPropertyValue('font-size'), editedPTag)
    expect(editedFontSize).toBe('200px')

    await stylePage.restore()
    await page.goto('about:blank')
  })

  // Added because of a regression in react-hot-loader, see issues: #4246 #4273
  // Also: https://github.com/zeit/styled-jsx/issues/425
  it('should update styles in a stateful component correctly', async () => {
    const statefulComponentPage = await fsTimeMachine(join(__dirname, '../pages/hmr/style-stateful-component.js'))
    await page.goto(server.getURL('/hmr/style-stateful-component'))

    const pTag = await expect(page).toMatchElement('.hmr-style-page p')
    const initialFontSize = await page.evaluate(e => window.getComputedStyle(e).getPropertyValue('font-size'), pTag)
    expect(initialFontSize).toBe('100px')

    await statefulComponentPage.replace('100px', '200px')
    await page.waitForRequest(request => /\.hot-update\.js$/.test(request.url()))

    const editedPTag = await expect(page).toMatchElement('.hmr-style-page p')
    const editedFontSize = await page.evaluate(e => window.getComputedStyle(e).getPropertyValue('font-size'), editedPTag)
    expect(editedFontSize).toBe('200px')
    await statefulComponentPage.restore()
  })

  // Added because of a regression in react-hot-loader, see issues: #4246 #4273
  // Also: https://github.com/zeit/styled-jsx/issues/425
  it('should update styles in a dynamic component correctly', async () => {
    const hmrDynamicPage = await fsTimeMachine(join(__dirname, '../components/hmr/dynamic.js'))
    await page.goto(server.getURL('/hmr/style-dynamic-component'))
    const div = await expect(page).toMatchElement('#dynamic-component')
    const initialClientClassName = await page.evaluate(e => e.getAttribute('class'), div)
    const initialFontSize = await page.evaluate(e => window.getComputedStyle(e).getPropertyValue('font-size'), div)

    expect(initialFontSize).toBe('100px')

    const $ = await server.fetch$('/hmr/style-dynamic-component')
    expect($.html().includes('100px')).toBeTruthy()
    const initialServerClassName = $('#dynamic-component').attr('class')
    expect(initialClientClassName === initialServerClassName).toBeTruthy()

    // Change the page
    await hmrDynamicPage.replace('100px', '200px')
    await page.waitForRequest(request => /\.hot-update\.js$/.test(request.url()))

    // Check whether the this page has reloaded or not.
    const editedDiv = await expect(page).toMatchElement('#dynamic-component')
    const editedClientClassName = await page.evaluate(e => e.getAttribute('class'), editedDiv)
    const editedFontSize = await page.evaluate(e => window.getComputedStyle(e).getPropertyValue('font-size'), editedDiv)
    const editedHtml = await page.evaluate('document.documentElement.innerHTML')

    expect(editedFontSize).toBe('200px')
    expect(editedHtml.includes('font-size:200px;')).toBe(true)
    expect(editedHtml.includes('font-size:100px;')).toBe(false)

    const edited$ = await server.fetch$('/hmr/style-dynamic-component')
    expect(edited$.html().includes('200px')).toBeTruthy()
    const editedServerClassName = edited$('#dynamic-component').attr('class')

    expect(editedClientClassName === editedServerClassName).toBe(true)
    await hmrDynamicPage.restore()
  })
})
