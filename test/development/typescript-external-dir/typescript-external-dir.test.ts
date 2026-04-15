import { join } from 'path'
import { FileRef, nextTestSetup } from 'e2e-utils'

describe('typescript-external-dir', () => {
  const { next } = nextTestSetup({
    subDir: 'project',
    files: {
      'next.config.js': new FileRef(join(__dirname, 'project/next.config.js')),
      'tsconfig.json': new FileRef(join(__dirname, 'project/tsconfig.json')),
      pages: new FileRef(join(__dirname, 'project/pages')),
      components: new FileRef(join(__dirname, 'project/components')),
      '../shared/tsconfig.json': new FileRef(
        join(__dirname, 'shared/tsconfig.json')
      ),
      '../shared/components': new FileRef(join(__dirname, 'shared/components')),
      '../shared/libs': new FileRef(join(__dirname, 'shared/libs')),
    },
  })

  it('should render the page with external TS/TSX dependencies', async () => {
    const $ = await next.render$('/')
    expect($('body').text()).toMatch(/Hello World!Counter: 0/)
  })
})
