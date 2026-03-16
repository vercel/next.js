import path from 'node:path'
import { nextTestSetup } from 'e2e-utils'

describe('Babel', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'fixture'),
    dependencies: {
      '@babel/preset-flow': '7.25.9',
    },
  })

  it('Should compile a page with flowtype correctly', async () => {
    const $ = await next.render$('/')
    expect($('#text').text()).toBe('Test Babel')
  })
})
