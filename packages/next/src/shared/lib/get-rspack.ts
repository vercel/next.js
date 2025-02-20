export function getRspackCore() {
  try {
    // eslint-disable-next-line import/no-extraneous-dependencies
    return require('@rspack/core')
  } catch (e) {
    if (e instanceof Error && 'code' in e && e.code === 'MODULE_NOT_FOUND') {
      throw new Error(
        '@rspack/core is not available. Please make sure `@next/plugin-rspack` is correctly installed.'
      )
    }

    throw e
  }
}

export function getRspackReactRefresh() {
  try {
    // eslint-disable-next-line import/no-extraneous-dependencies
    return require('@rspack/plugin-react-refresh')
  } catch (e) {
    if (e instanceof Error && 'code' in e && e.code === 'MODULE_NOT_FOUND') {
      throw new Error(
        '@rspack/plugin-react-refresh is not available. Please make sure `@next/plugin-rspack` is correctly installed.'
      )
    }

    throw e
  }
}
