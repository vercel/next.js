/* eslint-env jest */
import { attachReactRefresh } from 'next/dist/build/webpack-config'
import * as storybookPlugin from '../../packages/next-plugin-storybook/preset'

describe('next-plugin-storybook filterModuleRules', () => {
  it('should filter module rules correctly', async () => {
    const input = {
      module: { rules: [{ test: 'babel-loader' }, { test: /.*\.css/ }] },
    }
    const expected = [{ test: 'babel-loader' }]

    const output = storybookPlugin.filterModuleRules(input)
    expect(output).toEqual(expected)
  })
})

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
        rules: [
          {
            use: [
              'next/dist/compiled/@next/react-refresh-utils/dist/loader',
              'rr',
            ],
          },
        ],
      },
    }
    const expected = {
      module: {
        rules: [
          {
            use: [
              'next/dist/compiled/@next/react-refresh-utils/dist/loader',
              'rr',
            ],
          },
        ],
      },
    }

    attachReactRefresh(input, 'rr')
    expect(input).toEqual(expected)
  })

  it('should skip adding when existing (longhand)', () => {
    const input = {
      module: {
        rules: [
          {
            use: [
              require.resolve(
                'next/dist/compiled/@next/react-refresh-utils/dist/loader'
              ),
              'rr',
            ],
          },
        ],
      },
    }
    const expected = {
      module: {
        rules: [
          {
            use: [
              require.resolve(
                'next/dist/compiled/@next/react-refresh-utils/dist/loader'
              ),
              'rr',
            ],
          },
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
              expect.stringMatching(
                /react-refresh-utils[\\/]dist[\\/]loader\.js/
              ),
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
              expect.stringMatching(
                /react-refresh-utils[\\/]dist[\\/]loader\.js/
              ),
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
              expect.stringMatching(
                /react-refresh-utils[\\/]dist[\\/]loader\.js/
              ),
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
              expect.stringMatching(
                /react-refresh-utils[\\/]dist[\\/]loader\.js/
              ),
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
              expect.stringMatching(
                /react-refresh-utils[\\/]dist[\\/]loader\.js/
              ),
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
              'next/dist/compiled/@next/react-refresh-utils/dist/loader',
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
              'next/dist/compiled/@next/react-refresh-utils/dist/loader',
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
              'next/dist/compiled/@next/react-refresh-utils/dist/loader',
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
              'next/dist/compiled/@next/react-refresh-utils/dist/loader',
              'bla',
            ],
          },
        ],
      },
    })
  })
})
