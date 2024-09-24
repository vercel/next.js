import { FileRef, nextTestSetup } from 'e2e-utils'
import webdriver from 'next-webdriver'
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
      '@emotion/cache': 'latest',
      '@emotion/react': 'latest',
      '@emotion/server': 'latest',
      '@emotion/styled': 'latest',
      '@mui/icons-material': 'latest',
      '@mui/material': 'latest',
      next: 'latest',
      'prop-types': 'latest',
      // Use minimum peer dep version instead of v9 of eslint to avoid breaking changes
      eslint: '8.56.0',
      'eslint-config-next': 'latest',
    },
  })

  it('should render MuiLink with <a>', async () => {
    const browser = await webdriver(next.url, `/`)
    const element = browser.elementByCss('a[href="/about"]')

    const color = await element.getComputedCss('color')
    expect(color).toBe('rgb(25, 133, 123)')

    const text = await element.text()
    expect(text).toBe('Go to the about page')
  })
})
