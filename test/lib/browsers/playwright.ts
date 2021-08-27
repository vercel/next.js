import { BrowserInterface } from './base'

class Playwright extends BrowserInterface {
  async setup() {
    console.log('setting up playwright')
  }
}

export default Playwright
