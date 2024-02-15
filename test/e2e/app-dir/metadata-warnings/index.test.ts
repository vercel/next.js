import { createNextDescribe } from 'e2e-utils'
import { fetchViaHTTP } from 'next-test-utils'

const METADATA_BASE_WARN_STRING =
  'metadataBase property in metadata export is not set for resolving social open graph or twitter images,'

createNextDescribe(
  'app dir - metadata missing metadataBase',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next, isNextDev }) => {
    // If it's start mode, we get the whole logs since they're from build process.
    // If it's dev mode, we get the logs after request
    function getCliOutput(logStartPosition: number) {
      return isNextDev ? next.cliOutput.slice(logStartPosition) : next.cliOutput
    }

    if (isNextDev) {
      it('should not warn metadataBase is missing if there is only absolute url', async () => {
        const logStartPosition = next.cliOutput.length
        await fetchViaHTTP(next.url, '/absolute-url-og')
        const output = getCliOutput(logStartPosition)
        expect(output).not.toInclude(METADATA_BASE_WARN_STRING)
      })
    }

    it('should fallback to localhost if metadataBase is missing for absolute urls resolving', async () => {
      const logStartPosition = next.cliOutput.length
      await fetchViaHTTP(next.url, '/og-image-convention')
      const output = getCliOutput(logStartPosition)
      expect(output).toInclude(METADATA_BASE_WARN_STRING)
      expect(output).toMatch(/using "http:\/\/localhost:\d+/)
      expect(output).toInclude(
        '. See https://nextjs.org/docs/app/api-reference/functions/generate-metadata#metadatabase'
      )
    })

    it('should warn for unsupported metadata properties', async () => {
      const logStartPosition = next.cliOutput.length
      await fetchViaHTTP(next.url, '/unsupported-metadata')
      const output = getCliOutput(logStartPosition)
      expect(output).toInclude(
        'Unsupported metadata themeColor is configured in metadata export in /unsupported-metadata. Please move it to viewport'
      )
      expect(output).toInclude(
        'Read more: https://nextjs.org/docs/app/api-reference/functions/generate-viewport'
      )
    })
  }
)
