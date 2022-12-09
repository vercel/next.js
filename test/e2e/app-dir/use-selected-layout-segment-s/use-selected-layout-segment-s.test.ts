import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import webdriver from 'next-webdriver'

describe('useSelectedLayoutSegment(s)', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(__dirname),
      dependencies: {
        react: 'latest',
        'react-dom': 'latest',
        typescript: 'latest',
        '@types/react': 'latest',
        '@types/node': 'latest',
      },
    })
  })
  afterAll(() => next.destroy())

  it('should return correct values for various layouts', async () => {
    const browser = await webdriver(
      next.url,
      '/segment-name/value1/segment-name2/value2/value3/value4'
    )

    expect(
      await browser.elementByCss('#root > .segments').text()
    ).toMatchInlineSnapshot(
      `"[\\"segment-name\\",\\"value1\\",\\"segment-name2\\",\\"value2\\",\\"value3/value4\\"]"`
    )

    expect(
      await browser.elementByCss('#before-static > .segments').text()
    ).toMatchInlineSnapshot(
      `"[\\"segment-name2\\",\\"value2\\",\\"value3/value4\\"]"`
    )

    expect(
      await browser.elementByCss('#before-param > .segments').text()
    ).toMatchInlineSnapshot(`"[\\"value2\\",\\"value3/value4\\"]"`)

    expect(
      await browser.elementByCss('#final > .segments').text()
    ).toMatchInlineSnapshot(`"[]"`)
  })
})
