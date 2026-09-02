import path from 'path'
import { isNextStart, nextTestSetup } from 'e2e-utils'

const assetPrefix = 'https://example.vercel.sh'

if (!isNextStart) {
  // TODO(deploy-test-completion): Re-enable this suite in deploy mode.
  // No deploy-specific incompatibility is documented.
  // @force-gate !deploy
  describe('app dir - crossOrigin config', () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

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
} else {
  describe('app dir - unset crossOrigin config', () => {
    // Deploy mode exclusion: This branch only runs in next start mode.
    // @force-gate !deploy
    describe('default output', () => {
      const { next } = nextTestSetup({
        files: path.join(__dirname, 'default'),
      })

      function expectCrossOriginAttributesToBeOmitted(
        $: Awaited<ReturnType<typeof next.render$>>
      ) {
        const scripts = $(`script[src^="${assetPrefix}"]`)

        expect(scripts.length).toBeGreaterThan(0)
        scripts.each((_, script) => {
          expect($(script).attr('crossorigin')).toBeUndefined()
        })
      }

      it('does not add crossorigin attributes to statically generated scripts', async () => {
        expectCrossOriginAttributesToBeOmitted(await next.render$('/'))
      })

      it('does not add crossorigin attributes to dynamically rendered scripts', async () => {
        expectCrossOriginAttributesToBeOmitted(await next.render$('/dynamic'))
      })
    })

    if (process.env.__NEXT_CACHE_COMPONENTS !== 'true') {
      // Deploy mode exclusion: This test builds and starts the exported app
      // through a local custom server.
      // @force-gate !deploy
      describe('output: export', () => {
        const { next } = nextTestSetup({
          files: path.join(__dirname, 'default'),
          env: {
            NEXT_TEST_OUTPUT_EXPORT: '1',
          },
          skipStart: true,
          startCommand: 'node server.mjs',
          serverReadyPattern: /- Local:/,
        })

        function expectCrossOriginAttributesToBeOmitted(
          $: Awaited<ReturnType<typeof next.render$>>
        ) {
          const scripts = $(`script[src^="${assetPrefix}"]`)

          expect(scripts.length).toBeGreaterThan(0)
          scripts.each((_, script) => {
            expect($(script).attr('crossorigin')).toBeUndefined()
          })
        }

        it('does not add crossorigin attributes to exported scripts', async () => {
          await next.build()
          await next.start({ skipBuild: true })

          expectCrossOriginAttributesToBeOmitted(await next.render$('/'))
          expectCrossOriginAttributesToBeOmitted(await next.render$('/dynamic'))
        })
      })
    }
  })
}
