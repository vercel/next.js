import { nextTestSetup } from 'e2e-utils'

describe('turbopack-fragments-zod', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: { zod: '4.3.6' },
  })

  it('parses a string schema', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('valid')
  })

  it('parses a number schema', async () => {
    const $ = await next.render$('/number')
    expect($('p').text()).toBe('42')
  })

  it('retains an escaping namespace', async () => {
    const $ = await next.render$('/all')
    expect($('p').text().split(',')).toEqual(
      expect.arrayContaining(['string', 'number', 'object'])
    )
  })
})
