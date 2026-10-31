import { nextTestSetup } from 'e2e-utils'

describe('Custom Document Fragment Styles', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('correctly adds styles from fragment styles key', async () => {
    const $ = await next.render$('/')

    const styles = $('style').text()
    expect(styles).toMatch(/background:(.*|)hotpink/)
    expect(styles).toMatch(/font-size:(.*|)16\.4px/)
  })
})
