import fs from 'fs/promises'

/** @type {import('next').NextAdapter } */
export default {
  name: 'adapter-prerender-metadata',
  unstable_capabilities:
    process.env.NEXT_TEST_HTML_LIMITED_BOT_CAPABILITY === undefined
      ? undefined
      : {
          handlesHtmlLimitedBotPrerenders:
            process.env.NEXT_TEST_HTML_LIMITED_BOT_CAPABILITY === 'true',
        },
  async onBuildComplete(ctx) {
    await fs.writeFile('build-complete.json', JSON.stringify(ctx, null, 2))
  },
}
