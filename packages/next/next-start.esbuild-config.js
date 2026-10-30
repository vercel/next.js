const fs = require('fs')
const path = require('path')

const distDir = path.join(__dirname, 'dist')
const esmDir = path.join(distDir, 'esm')
const externalFiles = new Set([
  'server/require-hook',
  'server/lib/cpu-profile',
  'server/lib/trace/tracer',
  'server/lib/router-utils/setup-dev-bundler',
  'server/image-optimizer',
  'server/next-typescript',
])

module.exports = () => ({
  entryPoints: [path.join(esmDir, 'server/lib/start-server.js')],
  outfile: path.join(
    __dirname,
    'dist/compiled/next-server/start-server.runtime.prod.js'
  ),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20.9',
  minify: true,
  sourcemap: true,
  packages: 'external',
  plugins: [
    {
      name: 'next-runtime-externals',
      setup(build) {
        build.onResolve({ filter: /^\./ }, (args) => {
          const relative = path
            .relative(esmDir, path.resolve(args.resolveDir, args.path))
            .replace(/\\/g, '/')
            .replace(/\.js$/, '')
          if (
            externalFiles.has(relative) ||
            /\.(external|compiled)$/.test(relative) ||
            /^(cli|server\/dev|server\/web\/sandbox|next-devtools|trace|telemetry)(\/|$)/.test(
              relative
            ) ||
            (relative.startsWith('build/') &&
              !/^build\/(output(?:\/|$)|duration-to-string$)/.test(relative))
          ) {
            const resolved = require.resolve(path.join(distDir, relative))
            return {
              path: `next/dist/${path.relative(distDir, resolved).replace(/\\/g, '/')}`,
              external: true,
            }
          }
        })
        build.onEnd(({ errors }) => {
          if (errors.length) return
          const mapPath = build.initialOptions.outfile + '.map'
          const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'))
          map.ignoreList = map.sources.map((_, index) => index)
          fs.writeFileSync(mapPath, JSON.stringify(map))
        })
        build.onLoad(
          { filter: /[\\/]esm[\\/]server[\\/]next\.js$/ },
          (args) => ({
            // The CommonJS bridge belongs to the unbundled require('next') entry.
            contents: fs
              .readFileSync(args.path, 'utf8')
              .replace('module.exports = createServer;', ''),
            loader: 'js',
          })
        )
      },
    },
  ],
})
