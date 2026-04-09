import { computeChangedPath, getSelectedParams } from './compute-changed-path'
import { PrefetchHint } from '../../../shared/lib/app-router-types'

describe('computeChangedPath', () => {
  it('should return the correct path', () => {
    expect(
      computeChangedPath(
        [
          '',
          {
            children: [
              '(marketing)',
              {
                children: ['__PAGE__', {}],
                modal: [
                  '(...)stats',
                  {
                    children: [
                      ['key', 'github', 'd', null],
                      {
                        children: ['__PAGE__', {}],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          PrefetchHint.IsRootLayout,
        ],
        [
          '',
          {
            children: [
              '(marketing)',
              {
                children: ['__PAGE__', {}],
                modal: [
                  '(...)stats',
                  {
                    children: [
                      ['key', 'github', 'd', null],
                      {
                        children: ['__PAGE__', {}],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          PrefetchHint.IsRootLayout,
        ]
      )
    ).toBe('/')
  })
})

describe('getSelectedParams', () => {
  const originalOutput = process.env.__NEXT_CONFIG_OUTPUT
  const originalWindow = global.window

  afterEach(() => {
    process.env.__NEXT_CONFIG_OUTPUT = originalOutput
    global.window = originalWindow
  })

  it('resolves deferred export fallback params from the current pathname', () => {
    process.env.__NEXT_CONFIG_OUTPUT = 'export'
    global.window = {
      location: {
        pathname: '/another/third',
      },
    } as Window & typeof globalThis

    expect(
      getSelectedParams([
        '',
        {
          children: [
            'another',
            {
              children: [['slug', '%%drp:slug:abc123%%', 'd', null], {}],
            },
          ],
        },
      ])
    ).toEqual({ slug: 'third' })
  })
})
