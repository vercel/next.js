import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import webdriver from 'next-webdriver'
import { waitFor } from 'next-test-utils'

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

  let browser: Awaited<ReturnType<typeof webdriver>>
  beforeEach(async () => {
    browser = await webdriver(
      next.url,
      '/segment-name/value1/segment-name2/value2/value3/value4'
    )
  })

  it('should return correct values for root layout', async () => {
    expect(
      await browser.elementByCss('#root > .segments').text()
    ).toMatchInlineSnapshot(
      `"[\\"segment-name\\",\\"value1\\",\\"segment-name2\\",\\"value2\\",\\"value3/value4\\"]"`
    )

    expect(
      await browser.elementByCss('#root > .segment').text()
    ).toMatchInlineSnapshot(`"\\"segment-name\\""`)
  })

  it('should return correct values in layout before static segment', async () => {
    expect(
      await browser.elementByCss('#before-static > .segments').text()
    ).toMatchInlineSnapshot(
      `"[\\"segment-name2\\",\\"value2\\",\\"value3/value4\\"]"`
    )

    expect(
      await browser.elementByCss('#before-static > .segment').text()
    ).toMatchInlineSnapshot(`"\\"segment-name2\\""`)
  })

  it('should return correct values in layout before param segment', async () => {
    expect(
      await browser.elementByCss('#before-param > .segments').text()
    ).toMatchInlineSnapshot(`"[\\"value2\\",\\"value3/value4\\"]"`)

    expect(
      await browser.elementByCss('#before-param > .segment').text()
    ).toMatchInlineSnapshot(`"\\"value2\\""`)
  })

  it('should return correct values in layout after last segment', async () => {
    expect(
      await browser.elementByCss('#final > .segments').text()
    ).toMatchInlineSnapshot(`"[]"`)

    expect(
      await browser.elementByCss('#final > .segment').text()
    ).toMatchInlineSnapshot(`"null"`)
  })

  it('should correctly update when changing static segment', async () => {
    browser.elementById('change-static').click()
    await waitFor(100)

    expect(
      await browser.elementByCss('#root > .segments').text()
    ).toMatchInlineSnapshot(
      `"[\\"segment-name\\",\\"param1\\",\\"different-segment\\"]"`
    )

    expect(
      await browser.elementByCss('#before-static > .segments').text()
    ).toMatchInlineSnapshot(`"[\\"different-segment\\"]"`)

    expect(
      await browser.elementByCss('#before-static > .segment').text()
    ).toMatchInlineSnapshot(`"\\"different-segment\\""`)
  })
})
