import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { replacement } from './transform-helper.mjs'
export default defineConfig(async ({ mode }) => {
  const captured = await Promise.resolve(replacement)
  if (mode !== 'test')
    throw new Error('Expected the real test config environment')
  return {
    plugins: [
      {
        name: 'helper-closure',
        async transform(code, id) {
          if (!id.endsWith('/subject.mjs')) return
          this.addWatchFile(
            fileURLToPath(new URL('./transform-helper.mjs', import.meta.url))
          )
          return (await Promise.resolve(code)).replace(
            /value\s*=\s*1/,
            'value=' + captured
          )
        },
      },
    ],
    test: { include: ['*.case.mjs'] },
  }
})
