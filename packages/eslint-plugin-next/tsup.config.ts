// It wants this to be a dep, not devDep, which is wrong
// eslint-disable-next-line import/no-extraneous-dependencies
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
})
