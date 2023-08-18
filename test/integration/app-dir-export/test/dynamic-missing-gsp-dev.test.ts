import { runTests } from './utils'

it('should error when dynamic route is missing generateStaticParams', async () => {
  await runTests({
    isDev: true,
    generateStaticParamsEnabled: false,
    expectedErrMsg:
      'Page "/another/[slug]" is missing exported function "generateStaticParams()", which is required with "output: export" config.',
  })
})
