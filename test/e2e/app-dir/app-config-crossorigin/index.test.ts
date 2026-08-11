import cheerio from 'cheerio'
import path from 'path'
import { isNextStart, nextTestSetup } from 'e2e-utils'

const assetPrefix = 'https://example.vercel.sh'

function expectCrossOriginAttributesToBeOmitted(html: string) {
  const $ = cheerio.load(html)
  const scripts = $(`script[src^="${assetPrefix}"]`)

  expect(scripts.length).toBeGreaterThan(0)
  scripts.each((_, script) => {
    expect($(script).attr('crossorigin')).toBeUndefined()
  })
}

describe('app dir - crossOrigin config', () => {
  const {
    next,
    isNextStart: isConfiguredNextStart,
    skipped,
  } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  if (isConfiguredNextStart) {
    it('skip in start mode', () => {})
    return
  }
  it('should render correctly with assetPrefix: "/"', async () => {
    const $ = await next.render$('/')
    // Only potential external (assetPrefix) <script /> and <link /> should have crossorigin attribute
    $(
      'script[src*="https://example.vercel.sh"], link[href*="https://example.vercel.sh"]'
    ).each((_, el) => {
      const crossOrigin = $(el).attr('crossorigin')
      expect(crossOrigin).toBe('use-credentials')
    })

    // Inline <script /> (including RSC payload) and <link /> should not have crossorigin attribute
    $('script:not([src]), link:not([href])').each((_, el) => {
      const crossOrigin = $(el).attr('crossorigin')
      expect(crossOrigin).toBeUndefined()
    })

    // Same origin <script /> and <link /> should not have crossorigin attribute either
    $('script[src^="/"], link[href^="/"]').each((_, el) => {
      const crossOrigin = $(el).attr('crossorigin')
      expect(crossOrigin).toBeUndefined()
    })
  })
})

if (isNextStart) {
  describe('app dir - unset crossOrigin config', () => {
    describe('default output', () => {
      const { next } = nextTestSetup({
        files: path.join(__dirname, 'default'),
        skipStart: true,
        skipDeployment: true,
      })

      beforeAll(async () => {
        await next.build()
        await next.start()
      })

      it('does not add crossorigin attributes to statically generated scripts', async () => {
        expectCrossOriginAttributesToBeOmitted(
          await next.readFile('.next/server/app/index.html')
        )
      })

      it('does not add crossorigin attributes to dynamically rendered scripts', async () => {
        expectCrossOriginAttributesToBeOmitted(await next.render('/dynamic'))
      })
    })

    describe('output: export', () => {
      const { next } = nextTestSetup({
        files: path.join(__dirname, 'default'),
        env: {
          NEXT_TEST_OUTPUT_EXPORT: '1',
        },
        skipStart: true,
        skipDeployment: true,
      })

      it('does not add crossorigin attributes to exported scripts', async () => {
        await next.build()

        expectCrossOriginAttributesToBeOmitted(
          await next.readFile('out/index.html')
        )
        expectCrossOriginAttributesToBeOmitted(
          await next.readFile('out/dynamic.html')
        )
      })
    })
  })
}
