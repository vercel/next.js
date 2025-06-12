/**
 * @jest-environment jsdom
 */
/* eslint-disable @next/internal/typechecked-require -- Not a prod file */
/* eslint-disable import/no-extraneous-dependencies -- Not a prod file */

import type * as SegmentExplorer from './segment-explorer'

describe('Segment Explorer', () => {
  let cleanup: typeof import('@testing-library/react').cleanup
  let renderHook: typeof import('@testing-library/react').renderHook
  let useSegmentTree: typeof SegmentExplorer.useSegmentTree
  let insertSegmentNode: typeof SegmentExplorer.insertSegmentNode
  let removeSegmentNode: typeof SegmentExplorer.removeSegmentNode

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()

    const segmentExplorer = require('./segment-explorer')
    useSegmentTree = segmentExplorer.useSegmentTree
    insertSegmentNode = segmentExplorer.insertSegmentNode
    removeSegmentNode = segmentExplorer.removeSegmentNode
    const rtl = require('@testing-library/react/pure')
    renderHook = rtl.renderHook
    cleanup = rtl.cleanup
  })

  afterEach(() => {
    cleanup()
  })

  test('add complex structure', () => {
    insertSegmentNode({ pagePath: '/a/page.js', type: 'page' })
    insertSegmentNode({ pagePath: '/a/layout.js', type: 'layout' })
    insertSegmentNode({ pagePath: '/layout.js', type: 'layout' })

    const { result } = renderHook(useSegmentTree)

    expect(result.current).toEqual({
      children: {
        '': {
          children: {
            a: {
              children: {
                'layout.js': {
                  children: {},
                  value: {
                    pagePath: '/a/layout.js',
                    type: 'layout',
                  },
                },
                'page.js': {
                  children: {},
                  value: {
                    pagePath: '/a/page.js',
                    type: 'page',
                  },
                },
              },
              value: undefined,
            },
            'layout.js': {
              children: {},
              value: {
                pagePath: '/layout.js',
                type: 'layout',
              },
            },
          },
          value: undefined,
        },
      },
      value: undefined,
    })
  })

  test('remove node in the middle', () => {
    insertSegmentNode({ pagePath: '/a/b/@sidebar/page.js', type: 'page' })
    insertSegmentNode({ pagePath: '/a/b/page.js', type: 'page' })
    insertSegmentNode({ pagePath: '/a/b/layout.js', type: 'layout' })
    insertSegmentNode({ pagePath: '/a/layout.js', type: 'layout' })
    insertSegmentNode({ pagePath: '/layout.js', type: 'layout' })

    const { result } = renderHook(useSegmentTree)

    expect(result.current).toEqual({
      children: {
        '': {
          children: {
            a: {
              children: {
                b: {
                  children: {
                    '@sidebar': {
                      children: {
                        'page.js': {
                          children: {},
                          value: {
                            pagePath: '/a/b/@sidebar/page.js',
                            type: 'page',
                          },
                        },
                      },
                      value: undefined,
                    },
                    'layout.js': {
                      children: {},
                      value: {
                        pagePath: '/a/b/layout.js',
                        type: 'layout',
                      },
                    },
                    'page.js': {
                      children: {},
                      value: {
                        pagePath: '/a/b/page.js',
                        type: 'page',
                      },
                    },
                  },
                  value: undefined,
                },
                'layout.js': {
                  children: {},
                  value: {
                    pagePath: '/a/layout.js',
                    type: 'layout',
                  },
                },
              },
              value: undefined,
            },
            'layout.js': {
              children: {},
              value: {
                pagePath: '/layout.js',
                type: 'layout',
              },
            },
          },
          value: undefined,
        },
      },
      value: undefined,
    })

    removeSegmentNode({ pagePath: '/a/b/layout.js', type: 'layout' })

    expect(result.current).toEqual({
      children: {
        '': {
          children: {
            a: {
              children: {
                b: {
                  children: {
                    '@sidebar': {
                      children: {
                        'page.js': {
                          children: {},
                          value: {
                            pagePath: '/a/b/@sidebar/page.js',
                            type: 'page',
                          },
                        },
                      },
                      value: undefined,
                    },
                    'page.js': {
                      children: {},
                      value: {
                        pagePath: '/a/b/page.js',
                        type: 'page',
                      },
                    },
                  },
                  value: undefined,
                },
                'layout.js': {
                  children: {},
                  value: {
                    pagePath: '/a/layout.js',
                    type: 'layout',
                  },
                },
              },
              value: undefined,
            },
            'layout.js': {
              children: {},
              value: {
                pagePath: '/layout.js',
                type: 'layout',
              },
            },
          },
          value: undefined,
        },
      },
      value: undefined,
    })
  })
})
