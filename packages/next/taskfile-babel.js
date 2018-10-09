// taskr babel plugin with Babel 7 support
// https://github.com/lukeed/taskr/pull/305
'use strict'

const transform = require('@babel/core').transform
const flatten = require('flatten')

const NEXT_VERSION = require('./package.json').version
const BABEL_REGEX = /(^@babel\/)(preset|plugin)-(.*)/i
const BABEL_CONFIG = {
  'presets': [
    '@babel/preset-env',
    '@babel/preset-react',
    '@babel/preset-flow'
  ],
  'plugins': [
    '@babel/plugin-syntax-dynamic-import',
    '@babel/plugin-proposal-object-rest-spread',
    '@babel/plugin-proposal-class-properties',
    ['@babel/plugin-transform-runtime', {
      'corejs': 2
    }],
    ['babel-plugin-transform-define', {
      'process.env.NEXT_VERSION': NEXT_VERSION
    }]
  ]
}
const BABEL_CONFIG_SERVER = {
  'presets': [
    [
      '@babel/preset-env', {
        targets: {
          node: '8.0.0'
        }
      }
    ],
    '@babel/preset-react',
    '@babel/preset-flow'
  ],
  'plugins': [
    '@babel/plugin-syntax-dynamic-import',
    '@babel/plugin-proposal-object-rest-spread',
    '@babel/plugin-proposal-class-properties',
    ['babel-plugin-transform-define', {
      'process.env.NEXT_VERSION': NEXT_VERSION
    }]
  ]
}

function getBabels () {
  const pkg = require('./package.json')
  return flatten(
    ['devDependencies', 'dependencies'].map(s => Object.keys(pkg[s] || {}))
  ).filter(s => BABEL_REGEX.test(s))
}

module.exports = function (task) {
  let cache

  task.plugin('babel', {}, function * (file, opts) {
    if (opts.preload) {
      delete opts.preload
      // get dependencies
      cache = cache || getBabels()

      // attach any deps to babel's `opts`
      cache.forEach(dep => {
        const segs = BABEL_REGEX.exec(dep)
        const type = `${segs[2]}s`
        const name = `@babel/${segs[2]}-${segs[3]}`

        opts[type] = opts[type] || []

        // flatten all (advanced entries are arrays)
        if (flatten(opts[type]).indexOf(name) === -1) {
          opts[type] = opts[type].concat(name)
        }
      })
    }

    // attach file's name
    opts.filename = file.base

    const output = transform(file.data, Object.assign({}, opts, file.dir !== 'server' ? BABEL_CONFIG : BABEL_CONFIG_SERVER))

    if (output.map) {
      const map = `${file.base}.map`

      // append `sourceMappingURL` to original file
      if (opts.sourceMaps !== 'both') {
        output.code += Buffer.from(`\n//# sourceMappingURL=${map}`)
      }

      // add sourcemap to `files` array
      this._.files.push({
        base: map,
        dir: file.dir,
        data: Buffer.from(JSON.stringify(output.map))
      })
    }

    // update file's data
    file.data = Buffer.from(output.code)
  })
}
