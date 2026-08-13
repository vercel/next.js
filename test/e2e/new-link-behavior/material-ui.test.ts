import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'

const appDir = path.join(__dirname, 'material-ui')

describe('New Link Behavior with material-ui', () => {
  const { next } = nextTestSetup({
    files: {
      pages: new FileRef(path.join(appDir, 'pages')),
      src: new FileRef(path.join(appDir, 'src')),
      'next.config.js': new FileRef(path.join(appDir, 'next.config.js')),
    },
    dependencies: {
      '@emotion/cache': '11.10.5',
      '@emotion/react': '11.10.6',
      '@emotion/server': '11.10.0',
      '@emotion/styled': '11.10.6',
      '@mui/icons-material': '5.11.16',
      '@mui/material': '5.11.16',
      'prop-types': '15.8.1',
    },
  })

  it('should render MuiLink with <a>', async () => {
    const browser = await next.browser(`/`)
    const element = browser.elementByCss('a[href="/about"]')

    const color = await element.getComputedCss('color')
    expect(color).toBe('rgb(25, 133, 123)')

    const text = await element.text()
    expect(text).toBe('Go to the about page')
  })
})
