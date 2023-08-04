import { build } from 'esbuild'
;(async () => {
  const res = await build({
    entryPoints: ['./src/index.ts'],
    bundle: true,
    minify: true,
    outfile: './dist/index.js',
    platform: 'node',
    define: {
      'process.env.NODE_ENV': `"development"`,
    },
    format: 'cjs',
    external: ['graphql', '@prisma/client'],
  })
})()
