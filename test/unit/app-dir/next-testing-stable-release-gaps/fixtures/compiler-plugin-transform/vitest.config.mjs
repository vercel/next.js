import { defineConfig } from 'vitest/config'
export default defineConfig({
  plugins: [
    {
      name: 'release-transform',
      transform(code, id) {
        if (id.endsWith('/subject.mjs'))
          return code.replace(/value\s*=\s*1/, 'value=2')
      },
    },
  ],
  test: { include: ['*.case.mjs'] },
})
