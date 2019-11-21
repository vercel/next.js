/* eslint-disable
  arrow-body-style
*/
import { minify as terser, MinifyOptions } from 'terser'

const buildTerserOptions = ({
  ecma,
  warnings,
  parse = {},
  compress = {},
  mangle,
  module,
  output,
  toplevel,
  ie8,
  /* eslint-disable camelcase */
  keep_classnames,
  keep_fnames,
  /* eslint-enable camelcase */
  safari10,
}: MinifyOptions = {}) => ({
  ecma,
  warnings,
  parse: { ...parse },
  compress: typeof compress === 'boolean' ? compress : { ...compress },
  // eslint-disable-next-line no-nested-ternary
  mangle:
    mangle == null
      ? true
      : typeof mangle === 'boolean'
      ? mangle
      : { ...mangle },
  output: {
    shebang: true,
    comments: false,
    beautify: false,
    semicolons: true,
    ...output,
  },
  module,
  toplevel,
  ie8,
  keep_classnames,
  keep_fnames,
  safari10,
})

const minify = (options: {
  file: string
  input: string
  inputSourceMap?: string
  terserOptions?: MinifyOptions
}) => {
  const { file, input, inputSourceMap } = options

  // Copy terser options
  const terserOptions = buildTerserOptions(options.terserOptions) as any

  // Add source map data
  if (inputSourceMap) {
    terserOptions.sourceMap = {
      content: inputSourceMap,
    }
  }

  const { error, map, code, warnings } = terser(
    { [file]: input },
    terserOptions
  )

  return { error, map, code, warnings }
}

export default minify
