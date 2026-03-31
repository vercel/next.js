/**
 * @jest-environment jsdom
 */
/* eslint-disable @next/internal/typechecked-require -- Not a prod file */
/* eslint-disable import/no-extraneous-dependencies -- Not a prod file */

import type { SegmentNodeState } from '../userspace/app/segment-explorer-node'
import type * as SegmentExplorer from './segment-explorer-trie'

const createSegmentNode = ({
  pagePath,
  type,
}: {
  pagePath: string
  type: string
}): SegmentNodeState => {
  function placeholder() {}
  return {
    type,
    pagePath,
    boundaryType: null,
    setBoundaryType: placeholder,
  }
}

describe('Segment Explorer', () => {
  let cleanup: typeof import('@testing-library/react').cleanup
  let renderHook: typeof import('@testing-library/react').renderHook
  let useSegmentTree: typeof SegmentExplorer.useSegmentTree
  let insertSegmentNode: typeof SegmentExplorer.insertSegmentNode
  let removeSegmentNode: typeof SegmentExplorer.removeSegmentNode

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()

    const segmentExplorer =
      require('./segment-explorer-trie') as typeof SegmentExplorer
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
    insertSegmentNode(
      createSegmentNode({ pagePath: '/a/page.js', type: 'page' })
    )
    insertSegmentNode(
      createSegmentNode({ pagePath: '/a/layout.js', type: 'layout' })
    )
    insertSegmentNode(
      createSegmentNode({ pagePath: '/layout.js', type: 'layout' })
    )

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
                    boundaryType: null,
                    setBoundaryType: expect.anything(),
                  },
                },
                'page.js': {
                  children: {},
                  value: {
                    pagePath: '/a/page.js',
                    type: 'page',
                    boundaryType: null,
                    setBoundaryType: expect.anything(),
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
                boundaryType: null,
                setBoundaryType: expect.anything(),
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
    insertSegmentNode(
      createSegmentNode({ pagePath: '/a/b/@sidebar/page.js', type: 'page' })
    )
    insertSegmentNode(
      createSegmentNode({ pagePath: '/a/b/page.js', type: 'page' })
    )
    insertSegmentNode(
      createSegmentNode({ pagePath: '/a/b/layout.js', type: 'layout' })
    )
    insertSegmentNode(
      createSegmentNode({ pagePath: '/a/layout.js', type: 'layout' })
    )
    insertSegmentNode(
      createSegmentNode({ pagePath: '/layout.js', type: 'layout' })
    )

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
                            boundaryType: null,
                            setBoundaryType: expect.anything(),
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
                        boundaryType: null,
                        setBoundaryType: expect.anything(),
                      },
                    },
                    'page.js': {
                      children: {},
                      value: {
                        pagePath: '/a/b/page.js',
                        type: 'page',
                        boundaryType: null,
                        setBoundaryType: expect.anything(),
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
                    boundaryType: null,
                    setBoundaryType: expect.anything(),
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
                boundaryType: null,
                setBoundaryType: expect.anything(),
              },
            },
          },
          value: undefined,
        },
      },
      value: undefined,
    })

    removeSegmentNode(
      createSegmentNode({ pagePath: '/a/b/layout.js', type: 'layout' })
    )

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
                            boundaryType: null,
                            setBoundaryType: expect.anything(),
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
                        boundaryType: null,
                        setBoundaryType: expect.anything(),
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
                    boundaryType: null,
                    setBoundaryType: expect.anything(),
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
                boundaryType: null,
                setBoundaryType: expect.anything(),
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
