import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('image-sizing-warning', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('only warns when a modified dimension can stretch the image', async () => {
    const browser = await next.browser('/')

    await retry(async () => {
      expect(
        await browser.eval(
          () =>
            document.images.length === 8 &&
            Array.from(document.images).every(
              (img) => img.dataset.loaded === 'true'
            )
        )
      ).toBe(true)
    })

    // Only the rendered height coincides with the height prop in the report.
    expect(
      await browser.eval(() => {
        const img = document.getElementById('cover') as HTMLImageElement
        const style = getComputedStyle(img)
        return {
          width: img.width,
          height: img.height,
          objectFit: style.objectFit,
          aspectRatio: style.aspectRatio,
        }
      })
    ).toEqual({
      width: 680,
      height: 720,
      objectFit: 'cover',
      aspectRatio: '17 / 18',
    })

    // At a neighboring column width, neither dimension matches its prop.
    expect(
      await browser.eval(() => {
        const img = document.getElementById(
          'cover-neighbor'
        ) as HTMLImageElement
        return [img.width, img.height]
      })
    ).toEqual([681, 721])

    const warnings = (await browser.log())
      .map((log) => log.message)
      .filter((message) =>
        message.includes('has either width or height modified')
      )

    expect(warnings).toHaveLength(3)
    for (const id of ['fill', 'default', 'height-only']) {
      expect(
        warnings.some((message) => message.includes(`/sample.png?case=${id}`))
      ).toBe(true)
    }
  })
})
