import { nextTestSetup } from 'e2e-utils'

describe('require-context', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Recommended for tests that check HTML. Cheerio is a HTML parser that has a jQuery like API.
  it('should get correct require context when using regex filtering', async () => {
    const $ = await next.render$('/require-context-with-regex')
    expect($('pre').text()).toBe(
      JSON.stringify([
        './parent/file1.js',
        './parent/file2.js',
        './parent2/file3.js',
      ])
    )
  })

  // TODO: This test is already scaffolded and just needs to be turned on when turbopack supports it.
  // eslint-disable-next-line jest/no-commented-out-tests
  // it('should get correct require context when using no regex', async () => {
  //   const $ = await next.render$('/require-context-with-no-regex')
  //   expect($('pre').text()).toBe(
  //     JSON.stringify([
  //       './parent/file1',
  //       './parent/file1.js',
  //       './parent/file2',
  //       './parent/file2.js',
  //       './parent2/file3',
  //       './parent2/file3.js',
  //     ])
  //   )
  // })
})
