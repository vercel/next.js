import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import webdriver from 'next-webdriver'
import path from 'path'

const appDir = path.join(__dirname, 'material-ui')

describe('New Link Behavior with material-ui', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
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
        react: 'latest',
        'react-dom': 'latest',
        eslint: 'latest',
        'eslint-config-next': 'latest',
      },
    })
  })
  afterAll(() => next.destroy())

  it('should render MuiLink with <a>', async () => {
    const browser = await webdriver(next.url, `/`)
    const element = browser.elementByCss('a[href="/about"]')

    const color = await element.getComputedCss('color')
    expect(color).toBe('rgb(25, 133, 123)')

    const text = await element.text()
    expect(text).toBe('Go to the about page')
  })
})
