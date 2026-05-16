const { SourceMapGenerator } = require('source-map')
const path = require('path')
const { createHash } = require('crypto')

const markdownExtensions = [
  'md',
  'markdown',
  'mdown',
  'mkdn',
  'mkd',
  'mdwn',
  'mkdown',
  'ron',
]
const mdx = ['.mdx']
const md = markdownExtensions.map((/** @type {string} */ d) => '.' + d)

const own = {}.hasOwnProperty

const marker = {}
const cache = new WeakMap()

/*
 * From next.config.js's mdxRs option, construct an actual option object that mdxRs compiler accepts.
 */
function coereceMdxTransformOptions(options = {}) {
  const { mdxType, ...restOptions } = options

  let parse = undefined
  switch (mdxType) {
    case 'gfm':
      parse = {
        constructs: {
          gfmAutolinkLiteral: true,
          gfmFootnoteDefinition: true,
          gfmLabelStartFootnote: true,
          gfmStrikethrough: true,
          gfmTable: true,
          gfmTaskListItem: true,
        },
      }
      break
    case 'commonMark':
    default:
      parse = { gfmStrikethroughSingleTilde: true, mathTextSingleDollar: true }
      break
  }

  return {
    ...restOptions,
    parse,
  }
}

/**
 * A webpack loader for mdx-rs. This is largely based on existing @mdx-js/loader,
 * replaces internal compilation logic to use mdx-rs instead.
 */
function loader(value, bindings, callback) {
  const defaults = this.sourceMap ? { SourceMapGenerator } : {}
  const options = this.getOptions()
  const config = { ...defaults, ...options }
  const hash = getOptionsHash(options)
  const compiler = this._compiler || marker

  let map = cache.get(compiler)

  if (!map) {
    map = new Map()
    cache.set(compiler, map)
  }

  let process = map.get(hash)

  if (!process) {
    process = createFormatAwareProcessors(
      bindings,
      coereceMdxTransformOptions(config)
    ).compile
    map.set(hash, process)
  }

  process({ value, path: this.resourcePath }).then(
    (code) => {
      // TODO: no sourcemap
      callback(null, code, null)
    },
    (error) => {
      const fpath = path.relative(this.context, this.resourcePath)
      error.message = `${fpath}:${error.name}: ${error.message}`
      callback(error)
    }
  )
}

function getOptionsHash(options) {
  const hash = createHash('sha256')
  let key

  for (key in options) {
    if (own.call(options, key)) {
      const value = options[key]

      if (value !== undefined) {
        const valueString = JSON.stringify(value)
        hash.update(key + valueString)
      }
    }
  }

  return hash.digest('hex').slice(0, 16)
}

function createFormatAwareProcessors(bindings, compileOptions = {}) {
  const mdExtensions = compileOptions.mdExtensions || md
  const mdxExtensions = compileOptions.mdxExtensions || mdx

  let cachedMarkdown
  let cachedMdx

  return {
    extnames:
      compileOptions.format === 'md'
        ? mdExtensions
        : compileOptions.format === 'mdx'
          ? mdxExtensions
          : mdExtensions.concat(mdxExtensions),
    compile,
  }

  function compile({ value, path: p }) {
    const format =
      compileOptions.format === 'md' || compileOptions.format === 'mdx'
        ? compileOptions.format
        : path.extname(p) &&
            (compileOptions.mdExtensions || md).includes(path.extname(p))
          ? 'md'
          : 'mdx'

    const options = {
      parse: compileOptions.parse,
      development: compileOptions.development,
      providerImportSource: compileOptions.providerImportSource,
      jsx: compileOptions.jsx,
      jsxRuntime: compileOptions.jsxRuntime,
      jsxImportSource: compileOptions.jsxImportSource,
      pragma: compileOptions.pragma,
      pragmaFrag: compileOptions.pragmaFrag,
      pragmaImportSource: compileOptions.pragmaImportSource,
      filepath: p,
    }

    const compileMdx = (input) => bindings.mdx.compile(input, options)

    const processor =
      format === 'md'
        ? cachedMarkdown || (cachedMarkdown = compileMdx)
        : cachedMdx || (cachedMdx = compileMdx)

    return processor(value)
  }
}

module.exports = function (code) {
  const callback = this.async()
  const { loadBindings } = require('next/dist/build/swc')

  loadBindings().then((bindings) => {
    return loader.call(this, code, bindings, callback)
  })
}
