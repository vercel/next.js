import terser from 'next/dist/compiled/terser'

function buildTerserOptions(terserOptions: any = {}) {
  return {
    ...terserOptions,
    mangle:
      terserOptions.mangle == null
        ? true
        : typeof terserOptions.mangle === 'boolean'
        ? terserOptions.mangle
        : { ...terserOptions.mangle },
    // Ignoring sourceMap from options
    // eslint-disable-next-line no-undefined
    sourceMap: undefined,
    // the `output` option is deprecated
    ...(terserOptions.format
      ? { format: { beautify: false, ...terserOptions.format } }
      : { output: { beautify: false, ...terserOptions.output } }),
  }
}

export async function minify(options: any) {
  const { name, input, inputSourceMap, terserOptions } = options
  // Copy terser options
  const opts = buildTerserOptions(terserOptions)

  // Let terser generate a SourceMap
  if (inputSourceMap) {
    // @ts-ignore
    opts.sourceMap = { asObject: true }
  }

  const result = await terser.minify({ [name]: input }, opts)
  return result
}
