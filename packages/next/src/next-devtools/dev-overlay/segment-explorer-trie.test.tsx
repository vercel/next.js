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
  let act: typeof import('@testing-library/react').act
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
    act = rtl.act
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

  test('handle segments that collide with Object.prototype members', () => {
    insertSegmentNode(
      createSegmentNode({ pagePath: '/constructor/page.js', type: 'page' })
    )
    insertSegmentNode(
      createSegmentNode({ pagePath: '/toString/page.js', type: 'page' })
    )

    const { result } = renderHook(useSegmentTree)

    expect(result.current).toEqual({
      children: {
        '': {
          children: {
            constructor: {
              children: {
                'page.js': {
                  children: {},
                  value: {
                    pagePath: '/constructor/page.js',
                    type: 'page',
                    boundaryType: null,
                    setBoundaryType: expect.anything(),
                  },
                },
              },
              value: undefined,
            },
            toString: {
              children: {
                'page.js': {
                  children: {},
                  value: {
                    pagePath: '/toString/page.js',
                    type: 'page',
                    boundaryType: null,
                    setBoundaryType: expect.anything(),
                  },
                },
              },
              value: undefined,
            },
          },
          value: undefined,
        },
      },
      value: undefined,
    })

    act(() => {
      removeSegmentNode(
        createSegmentNode({ pagePath: '/constructor/page.js', type: 'page' })
      )
    })

    expect(result.current).toEqual({
      children: {
        '': {
          children: {
            toString: {
              children: {
                'page.js': {
                  children: {},
                  value: {
                    pagePath: '/toString/page.js',
                    type: 'page',
                    boundaryType: null,
                    setBoundaryType: expect.anything(),
                  },
                },
              },
              value: undefined,
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

    act(() => {
      removeSegmentNode(
        createSegmentNode({ pagePath: '/a/b/layout.js', type: 'layout' })
      )
    })

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

  test('gives changed nodes a new identity so consumers can memoize on them', () => {
    insertSegmentNode(
      createSegmentNode({ pagePath: '/a/layout.js', type: 'layout' })
    )

    const { result } = renderHook(useSegmentTree)

    // `pagePath` splits on '/', so the leading slash produces an empty segment.
    const rootBefore = result.current
    const aBefore = rootBefore.children['']!.children['a']!

    act(() => {
      insertSegmentNode(
        createSegmentNode({ pagePath: '/a/page.js', type: 'page' })
      )
    })

    const rootAfter = result.current
    const aAfter = rootAfter.children['']!.children['a']!

    // Consumers memoize on `node.children`, so every node along the mutated
    // path must be a fresh object. Reusing them would leave newly inserted
    // segments invisible until the consumer remounted.
    expect(rootAfter).not.toBe(rootBefore)
    expect(rootAfter.children).not.toBe(rootBefore.children)
    expect(aAfter).not.toBe(aBefore)
    expect(aAfter.children).not.toBe(aBefore.children)
    expect(Object.keys(aAfter.children)).toEqual(['layout.js', 'page.js'])

    // Untouched subtrees stay shared, and the previous snapshot is not mutated.
    expect(Object.keys(aBefore.children)).toEqual(['layout.js'])
    expect(aAfter.children['layout.js']).toBe(aBefore.children['layout.js'])
  })
})
