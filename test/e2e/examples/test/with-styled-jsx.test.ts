import { init, next } from './utils'
import webdriver from 'next-webdriver'
import { check } from 'next-test-utils'

describe('with-styled-jsx example', () => {
  init('with-styled-jsx')

  it('should render styles', async () => {
    const browser = await webdriver(next.url, '/')

    await check(
      () =>
        browser.eval(
          `window.getComputedStyle(document.querySelector('.hello')).backgroundColor`
        ),
      'rgb(238, 238, 238)'
    )
  })
})
