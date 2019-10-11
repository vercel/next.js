import findUp from 'find-up'

const EVENT_PLUGIN_PRESENT = 'NEXT_PACKAGE_DETECTED'
type EventPackageDetected = {
  packageName: string
  packageVersion: string
}

const plugins = [
  // CSS-in-JS solutions
  'styled-components',
  'radium',
  'aphrodite',
  'emotion',
  'glamorous',
  'glamor',
  'fela',
  'react-jss',
  'linaria',
  'typestyle',
  // Modern Plugins
  '@next/bundle-analyzer',
  '@next/mdx',
  // Legacy Plugins
  '@zeit/next-bundle-analyzer',
  '@zeit/next-css',
  '@zeit/next-less',
  '@zeit/next-mdx',
  '@zeit/next-preact',
  '@zeit/next-sass',
  '@zeit/next-source-maps',
  '@zeit/next-stylus',
  '@zeit/next-typescript',
  '@zeit/next-workers',
  // Community Plugins
  'next-env',
  'next-offline',
  'next-optimized-images',
  'next-runtime-dotenv',
  'next-progressbar',
  'next-transpile-modules',
  'next-react-svg',
  '@weco/next-plugin-transpile-modules',
  'next-images',
  'next-videos',
  'next-compose-plugins',
  'next-build-id',
  'next-routes',
  'next-router',
  'next-mdx-enhanced',
  'next-docify',
  'next-i18next',
  'next-redux-saga',
  'nookies',
  'next-aws-lambda',
  'serverless-nextjs-plugin',
  'next-plugin-styled-icons',
  '@ematipico/terraform-nextjs-plugin',
  'next-mui-helper',
  'nextjs-mui-helper',
  'next-router-events',
  '@moxy/next-runtime-env',
  'next-session',
  'next-apollo',
  'next-minimal-routes',
  'next-router-components',
  'next-page-loading-bar',
  'next-flexible-routes',
  'next-apollo-hoc',
  'routex.js',
  'nextron',
  'next-ga',
  'nextjs-redirect',
  'next-mobx-wrapper',
  'next-ym',
  'next-contentful',
  'f-next-ga',
  'next-plugin-yaml',
  'data-prefetch-link',
  'next-helpers',
  'next-plugin-modernizr',
  'nextjs-wp',
  'nextjs-middleware',
  'nextscript',
  'next-fbq',
  'next-analytics',
  '@engineerapart/nextscript',
  'next-data-link',
  '@blunck/next-alias',
  '@blunck/next-html',
  'next-universal-redirect',
  'create-next-app-lite',
  'next-babel-minify',
  '@rpominov/reason-next',
  'create-next-library',
  'nextscriptnew',
  'nextjs-sitemap-generator',
  '@dmartss/with-nprogress',
  'create-react-next-app',
  'hapi-nextjs',
  '@cotype/serverless-next',
  'nextjs-auth-hoc',
  '@preco21/next-fonts',
  '@dmartss/next-hoc',
  '@xiphe/serverless-nextjs-plugin',
  '@yellowiki/next-nprogress',
  '@hashicorp/next-prebuild',
  'next-i18next2.0',
  '@futpib/next-ga',
  'next-url-prettifier',
  'next-plugin-custom-babel-config',
  'fastify-nextjs',
  '@yolkai/next-routes',
  'trovit-next-routes',
  'next-routify',
  'wtp-next-routes',
  '@whatoplay/next-routes',
  '@ninetynine/next-routes',
  'electron-next',
  '@palmabit/sacajawea',
  'advanced-next-routes',
  'next-useragent',
  'next-routes-with-locale',
  'next-cookie',
  'next-i18n-routes',
  'next-graphql-react',
  'next-flash-messages',
  'next-manifest',
  'next-purgecss',
  'next-theme-webpack-plugin',
  'next-serverless',
  'connected-next-router',
  'cookies-next',
  'bs-next-alt',
  'bs-next',
  'next-redux',
  'next-awesome-typescript',
  'next-applicationinsights',
  'next-routes-2',
  'next-spa',
  'next-precache',
  'next-dynamic-routes',
  'next-lambda',
  'next-workbox',
  'next-inferno',
  'next-isserver',
  '@alicd/next-locale-provider',
  'shower-next',
  'next-md',
  '@primer/next',
  'next-pages',
  'amplify-next',
  'create-next-app',
  'neutron',
  'react-intl',
  'react-intl-universal',
  '@lingui/react',
  '@apollo/react-ssr',
]

export async function eventNextPlugins(
  dir: string
): Promise<Array<{ eventName: string; payload: EventPackageDetected }>> {
  try {
    const packageJsonPath = await findUp('package.json', { cwd: dir })
    if (!packageJsonPath) {
      return []
    }

    const { dependencies = {}, devDependencies = {} } = require(packageJsonPath)
    return (plugins
      .map(plugin => {
        const version = dependencies[plugin] || devDependencies[plugin]
        if (version) {
          return { pluginName: plugin, pluginVersion: version }
        }
      })
      .filter(Boolean) as {
      pluginName: string
      pluginVersion: string
    }[]).map(({ pluginName, pluginVersion }) => ({
      eventName: EVENT_PLUGIN_PRESENT,
      payload: {
        packageName: pluginName,
        packageVersion: pluginVersion,
      } as EventPackageDetected,
    }))
  } catch (_) {
    return []
  }
}
