/* eslint-env jest */
import { attachReactRefresh } from 'next/dist/build/webpack-config'

describe('webpack-config attachReactRefresh', () => {
  it('should skip adding when unrelated', () => {
    const input = { module: { rules: [{ use: 'a' }] } }
    const expected = { module: { rules: [{ use: 'a' }] } }

    attachReactRefresh(input, 'rr')
    expect(input).toEqual(expected)
  })

  it('should skip adding when existing (shorthand)', () => {
    const input = {
      module: {
        rules: [{ use: ['@next/react-refresh-utils/loader', 'rr'] }],
      },
    }
    const expected = {
      module: {
        rules: [{ use: ['@next/react-refresh-utils/loader', 'rr'] }],
      },
    }

    attachReactRefresh(input, 'rr')
    expect(input).toEqual(expected)
  })

  it('should skip adding when existing (longhand)', () => {
    const input = {
      module: {
        rules: [
          { use: [require.resolve('@next/react-refresh-utils/loader'), 'rr'] },
        ],
      },
    }
    const expected = {
      module: {
        rules: [
          { use: [require.resolve('@next/react-refresh-utils/loader'), 'rr'] },
        ],
      },
    }

    attachReactRefresh(input, 'rr')
    expect(input).toEqual(expected)
  })

  it('should add when missing (single, non-array)', () => {
    const input = {
      module: {
        rules: [{ use: 'rr' }],
      },
    }

    attachReactRefresh(input, 'rr')
    expect(input).toMatchObject({
      module: {
        rules: [
          {
            use: [
              expect.stringMatching(/react-refresh-utils[\\/]loader\.js/),
              'rr',
            ],
          },
        ],
      },
    })
  })

  it('should add when missing (single, array)', () => {
    const input = {
      module: {
        rules: [{ use: ['rr'] }],
      },
    }

    attachReactRefresh(input, 'rr')
    expect(input).toMatchObject({
      module: {
        rules: [
          {
            use: [
              expect.stringMatching(/react-refresh-utils[\\/]loader\.js/),
              'rr',
            ],
          },
        ],
      },
    })
  })

  it('should add when missing (before, array)', () => {
    const input = {
      module: {
        rules: [{ use: ['bla', 'rr'] }],
      },
    }

    attachReactRefresh(input, 'rr')
    expect(input).toMatchObject({
      module: {
        rules: [
          {
            use: [
              'bla',
              expect.stringMatching(/react-refresh-utils[\\/]loader\.js/),
              'rr',
            ],
          },
        ],
      },
    })
  })

  it('should add when missing (after, array)', () => {
    const input = {
      module: {
        rules: [{ use: ['rr', 'bla'] }],
      },
    }

    attachReactRefresh(input, 'rr')
    expect(input).toMatchObject({
      module: {
        rules: [
          {
            use: [
              expect.stringMatching(/react-refresh-utils[\\/]loader\.js/),
              'rr',
              'bla',
            ],
          },
        ],
      },
    })
  })

  it('should add when missing (multi, array)', () => {
    const input = {
      module: {
        rules: [{ use: ['hehe', 'haha', 'rawr', 'rr', 'lol', 'bla'] }],
      },
    }

    attachReactRefresh(input, 'rr')
    expect(input).toMatchObject({
      module: {
        rules: [
          {
            use: [
              'hehe',
              'haha',
              'rawr',
              expect.stringMatching(/react-refresh-utils[\\/]loader\.js/),
              'rr',
              'lol',
              'bla',
            ],
          },
        ],
      },
    })
  })

  it('should skip when present (multi, array)', () => {
    const input = {
      module: {
        rules: [
          {
            use: [
              'hehe',
              'haha',
              '@next/react-refresh-utils/loader',
              'rr',
              'lol',
              'bla',
            ],
          },
        ],
      },
    }

    attachReactRefresh(input, 'rr')
    expect(input).toMatchObject({
      module: {
        rules: [
          {
            use: [
              'hehe',
              'haha',
              '@next/react-refresh-utils/loader',
              'rr',
              'lol',
              'bla',
            ],
          },
        ],
      },
    })
  })

  it('should skip when present (multi, array, wrong order)', () => {
    const input = {
      module: {
        rules: [
          {
            use: [
              'hehe',
              'haha',
              'rr',
              'lol',
              '@next/react-refresh-utils/loader',
              'bla',
            ],
          },
        ],
      },
    }

    attachReactRefresh(input, 'rr')
    expect(input).toMatchObject({
      module: {
        rules: [
          {
            use: [
              'hehe',
              'haha',
              'rr',
              'lol',
              '@next/react-refresh-utils/loader',
              'bla',
            ],
          },
        ],
      },
    })
  })
})
