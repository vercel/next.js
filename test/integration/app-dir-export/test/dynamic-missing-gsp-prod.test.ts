import { runTests } from './utils'

it('should error when dynamic route is missing generateStaticParams', async () => {
  await runTests({
    isDev: false,
    dynamicPage: 'undefined',
    generateStaticParamsEnabled: false,
    expectedErrMsg:
      'Page "/another/[slug]" is missing "generateStaticParams()" so it cannot be used with "output: export" config.',
  })
})
