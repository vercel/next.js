import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'
import cheerio from 'cheerio'
import path from 'path'

const appDir = path.join(__dirname, 'typescript')

describe('New Link Behavior', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(path.join(appDir, 'pages')),
        'tsconfig.json': new FileRef(path.join(appDir, 'tsconfig.json')),
      },
      dependencies: {
        typescript: '*',
        '@types/react': '*',
        '@types/node': '*',
      },
    })
  })
  afterAll(() => next.destroy())

  it('should render link with <a>', async () => {
    const html = await renderViaHTTP(next.url, '/')
    const $ = cheerio.load(html)
    const $a = $('a')
    expect($a.text()).toBe('Visit')
    expect($a.attr('href')).toBe('/test')
  })
})
