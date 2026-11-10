import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('image-sizing-warning', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('warns about distortion while allowing cropping, source mismatches and rounding', async () => {
    const browser = await next.browser('/')

    await retry(async () => {
      expect(
        await browser.eval(
          () =>
            document.images.length === 17 &&
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

    expect(
      await browser.eval(() => {
        const img = document.getElementById(
          'source-mismatch'
        ) as HTMLImageElement
        return [
          img.width,
          img.height,
          img.naturalWidth,
          img.naturalHeight,
          img.getAttribute('height'),
        ]
      })
    ).toEqual([820, 720, 820, 720, '700'])

    expect(
      await browser.eval(() => {
        const img = document.getElementById('fractional') as HTMLImageElement
        return [img.width, img.height, getComputedStyle(img).height]
      })
    ).toEqual([75, 38, '37.5px'])

    // Rounding can produce more than one pixel of error on the longer axis.
    expect(
      await browser.eval(() =>
        ['fractional-wide', 'fractional-tall'].map((id) => {
          const img = document.getElementById(id) as HTMLImageElement
          return [img.width, img.height]
        })
      )
    ).toEqual([
      [75, 8],
      [8, 75],
    ])

    const densityRounded = await browser.eval(() => {
      const img = document.getElementById('density-rounded') as HTMLImageElement
      return {
        width: img.width,
        height: img.height,
        naturalRatio: img.naturalWidth / img.naturalHeight,
      }
    })
    expect([densityRounded.width, densityRounded.height]).toEqual([1640, 1440])
    // Width descriptors density-correct and truncate the natural dimensions.
    expect(densityRounded.naturalRatio).not.toBeCloseTo(820 / 720, 5)

    const warnings = (await browser.log())
      .map((log) => log.message)
      .filter((message) => message.includes('aspect ratio'))

    expect(
      warnings.map((message) => message.match(/\?case=([^"&\s]+)/)?.[1]).sort()
    ).toEqual([
      'default',
      'fill',
      'fill-neighbor',
      'height-only',
      'props-stretched',
    ])
  })
})
