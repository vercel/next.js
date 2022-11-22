import { init, next } from './utils'
import webdriver from 'next-webdriver'

describe('with-styled-jsx example', () => {
  init('with-styled-jsx')

  it('should render styles', async () => {
    const browser = await webdriver(next.url, '/')
    const color = await browser.eval(
      `getComputedStyle(document.querySelector('.hello')).backgroundColor`
    )
    expect(color).toMatch('rgb(238, 238, 238)')
  })
})
