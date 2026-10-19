import { defineConfig } from 'vitest/config'
import MagicString from 'magic-string'

function shifted(code, id, prefix, from, to) {
  const edit = new MagicString(code)
  edit.prepend(prefix)
  const original = `export const transformStages = '${from}'`
  const start = code.indexOf(original)
  if (start < 0) throw new Error('compiler transform stage was lost')
  edit.overwrite(
    start,
    start + original.length,
    `export const transformStages = '${to}'`
  )
  return {
    code: edit.toString(),
    map: JSON.parse(
      edit
        .generateMap({
          source: id,
          file: id,
          includeContent: true,
          hires: true,
        })
        .toString()
    ),
  }
}

export default defineConfig({
  plugins: [
    {
      name: 'mapped-first-edit',
      transform(code, id) {
        if (id.endsWith('/subject.mjs'))
          return shifted(
            code,
            id,
            '/* first actual edit */\n\n',
            'original',
            'first'
          )
      },
    },
    {
      name: 'mapped-second-edit',
      transform(code, id) {
        if (!id.endsWith('/subject.mjs')) return
        if (!code.startsWith('/* first actual edit */'))
          throw new Error('compiler transform order was lost')
        return shifted(
          code,
          id,
          '/* second actual edit */\n\n\n',
          'first',
          'second'
        )
      },
    },
  ],
  test: { include: ['*.case.mjs'] },
})
