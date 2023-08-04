import { build } from 'esbuild'
;(async () => {
  const res = await build({
    entryPoints: ['./src/index.ts'],
    bundle: true,
    minify: true,
    outfile: './dist/index.js',
    platform: 'node',
    format: 'cjs',
    define: {
      'process.env.NODE_ENV': `"production"`,
    },
    external: ['graphql', '@prisma/client'],
  })
})()
