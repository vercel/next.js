import postcss from 'postcss'
import type { PluginCreator } from 'postcss'

// Since the cssnano-preset-simple.js will be bundled into cssnano-simple
// during pre-compilation, we need to test against the source file directly
// @ts-expect-error -- untyped file
import cssnanoPresetSimple from './cssnano-preset-simple'

const cssnanoPlugin: PluginCreator<any> = (options = {}) => {
  const plugins: any[] = []
  const nanoPlugins = cssnanoPresetSimple(options).plugins
  for (const nanoPlugin of nanoPlugins) {
    if (Array.isArray(nanoPlugin)) {
      let [processor, opts] = nanoPlugin
      if (
        typeof opts === 'undefined' ||
        (typeof opts === 'object' && !opts.exclude) ||
        (typeof opts === 'boolean' && opts === true)
      ) {
        plugins.push(processor(opts))
      }
    } else {
      plugins.push(nanoPlugin)
    }
  }
  return postcss(plugins)
}
cssnanoPlugin.postcss = true

function noopTemplate(strings: TemplateStringsArray, ...keys: string[]) {
  const lastIndex = strings.length - 1
  return (
    strings.slice(0, lastIndex).reduce((p, s, i) => p + s + keys[i], '') +
    strings[lastIndex]
  )
}

describe('https://github.com/Timer/cssnano-preset-simple/issues/1', () => {
  test('evaluates without error', () => {
    cssnanoPresetSimple()
  })
})

describe('cssnano accepts plugin configuration', () => {
  test('should not remove all comments', async () => {
    const input = noopTemplate`
      p {
        /*! heading */
        color: yellow;
      }
    `

    const res = await postcss([cssnanoPlugin({ discardComments: {} })]).process(
      input,
      {
        from: 'input.css',
        to: 'output.css',
      }
    )

    expect(res.css).not.toBe('p{color:#ff0}')
  })

  test('should remove all comments', async () => {
    const input = noopTemplate`
      p {
        /*! heading */
        color: yellow;
      }
    `

    const res = await postcss([
      cssnanoPlugin({ discardComments: { removeAll: true } }),
    ]).process(input, {
      from: 'input.css',
      to: 'output.css',
    })

    expect(res.css).toBe('p{color:#ff0}')
  })
})

describe('property sorting', () => {
  test('should result in correct border width', async () => {
    const input = noopTemplate`
      p {
        border: 1px solid var(--test);
        border-radius: var(--test);
        border-width: 0;
      }
    `

    const res = await postcss([cssnanoPlugin]).process(input, {
      from: 'input.css',
      to: 'output.css',
    })

    expect(res.css).toMatchInlineSnapshot(
      `"p{border-width:1px;border-radius:var(--test);border:0 solid var(--test)}"`
    )
  })
})

describe('with escaped selector', () => {
  test('should not misplace the backslash', async () => {
    const input = `
      .foo\\,2 {
        background: blue;
      }
    `

    const res = await postcss([cssnanoPlugin]).process(input, {
      from: 'input.css',
      to: 'output.css',
    })

    expect(res.css).toMatchInlineSnapshot(`".foo\\,2{background:blue}"`)
  })
})
