import { warnOnce } from '../../build/output/log'

export function getRspackCore() {
  warnRspack()
  try {
    const paths = [require.resolve('next-rspack')]
    // eslint-disable-next-line import/no-extraneous-dependencies
    return require(require.resolve('@rspack/core', { paths }))
  } catch (e) {
    if (e instanceof Error && 'code' in e && e.code === 'MODULE_NOT_FOUND') {
      throw new Error(
        '@rspack/core is not available. Please make sure `next-rspack` is correctly installed.'
      )
    }

    throw e
  }
}

export function getAstGrep() {
  warnRspack()
  try {
    const paths = [require.resolve('next-rspack')]
    // eslint-disable-next-line import/no-extraneous-dependencies
    return require(require.resolve('@ast-grep/napi', { paths }))
  } catch (e) {
    if (e instanceof Error && 'code' in e && e.code === 'MODULE_NOT_FOUND') {
      throw new Error(
        '@ast-grep/napi is not available. Please make sure `next-rspack` is correctly installed.'
      )
    }

    throw e
  }
}

export function getRspackReactRefresh() {
  warnRspack()
  try {
    const paths = [require.resolve('next-rspack')]
    // eslint-disable-next-line import/no-extraneous-dependencies
    const plugin = require(
      require.resolve('@rspack/plugin-react-refresh', { paths })
    )
    const entry = require.resolve(
      '@rspack/plugin-react-refresh/react-refresh-entry',
      { paths }
    )
    plugin.entry = entry
    return plugin
  } catch (e) {
    if (e instanceof Error && 'code' in e && e.code === 'MODULE_NOT_FOUND') {
      throw new Error(
        '@rspack/plugin-react-refresh is not available. Please make sure `next-rspack` is correctly installed.'
      )
    }

    throw e
  }
}

function warnRspack() {
  if (process.env.__NEXT_TEST_MODE) {
    return
  }
  warnOnce(
    `\`next-rspack\` is currently experimental. It's not an official Next.js plugin, and is supported by the Rspack team in partnership with Next.js. Help improve Next.js and Rspack by providing feedback at https://github.com/vercel/next.js/discussions/77800`
  )
}
