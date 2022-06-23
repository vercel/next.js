import { createOptimisticTree } from 'next/client/components/helpers'
import { AppRouterState } from 'next/client/components/app-router.client'

describe('Routing helpers', () => {
  it('should create the correct optimistic tree for same-layout navigation', () => {
    const existingState: AppRouterState = {
      tree: [
        '',
        {
          children: [
            'dashboard',
            {
              children: ['page', {}],
            },
          ],
        },
        '/dashboard',
      ],
      cache: {
        subTreeData: null,
        childNodes: new Map([
          [
            'dashboard',
            {
              subTreeData: [
                {
                  type: 'h1',
                  key: null,
                  ref: null,
                  props: {
                    children: 'Dashboard',
                  },
                  _owner: null,
                  _store: {},
                },
                {
                  type: {
                    _payload: {
                      _status: 3,
                      _response: {
                        _bundlerConfig: null,
                        _chunks: {},
                        _partialRow: '',
                        _stringDecoder: {},
                      },
                    },
                  },
                  key: null,
                  ref: null,
                  props: {
                    layoutPath: '/dashboard',
                    childProp: {
                      current: null,
                      segment: 'page',
                    },
                  },
                  _owner: null,
                  _store: {},
                },
              ],
              childNodes: new Map([
                [
                  'page',
                  {
                    subTreeData: [
                      {
                        type: 'h1',
                        key: null,
                        ref: null,
                        props: {
                          children: 'Dashboard',
                        },
                        _owner: null,
                        _store: {},
                      },
                      {
                        type: {
                          _payload: {
                            _status: 3,
                            _response: {
                              _bundlerConfig: null,
                              _chunks: {},
                              _partialRow: '',
                              _stringDecoder: {},
                            },
                          },
                        },
                        key: null,
                        ref: null,
                        props: {
                          layoutPath: '/dashboard',
                          childProp: {
                            current: null,
                            segment: 'page',
                          },
                        },
                        _owner: null,
                        _store: {},
                      },
                    ],
                    childNodes: new Map(),
                  },
                ],
              ]),
            },
          ],
        ]),
      },
    }

    const fetch = global.fetch
    global.fetch = jest.fn(() => new Promise(() => {}))

    const href = '/dashboard/integrations'
    const url = new URL(href, 'http://localhost:3000')
    const segments = url.pathname.split('/')
    segments.push('page')
    const optimisticTree = createOptimisticTree(
      existingState,
      url,
      segments,
      existingState.tree,
      existingState.cache.childNodes,
      true,
      false
    )

    expect(existingState).toMatchSnapshot()

    expect(optimisticTree).toMatchSnapshot()

    global.fetch = fetch
  })

  it('should create the correct optimistic tree for different-layout navigation', () => {
    const existingState: AppRouterState = {
      tree: [
        '',
        {
          children: [
            'dashboard',
            {
              children: ['page', {}],
            },
          ],
        },
        '/dashboard',
      ],
      cache: {
        subTreeData: null,
        childNodes: new Map([
          [
            'dashboard',
            {
              subTreeData: [
                {
                  type: 'h1',
                  key: null,
                  ref: null,
                  props: {
                    children: 'Dashboard',
                  },
                  _owner: null,
                  _store: {},
                },
                {
                  type: {
                    _payload: {
                      _status: 3,
                      _response: {
                        _bundlerConfig: null,
                        _chunks: {},
                        _partialRow: '',
                        _stringDecoder: {},
                      },
                    },
                  },
                  key: null,
                  ref: null,
                  props: {
                    layoutPath: '/dashboard',
                    childProp: {
                      current: null,
                      segment: 'page',
                    },
                  },
                  _owner: null,
                  _store: {},
                },
              ],
              childNodes: new Map([
                [
                  'page',
                  {
                    subTreeData: [
                      {
                        type: 'h1',
                        key: null,
                        ref: null,
                        props: {
                          children: 'Dashboard',
                        },
                        _owner: null,
                        _store: {},
                      },
                      {
                        type: {
                          _payload: {
                            _status: 3,
                            _response: {
                              _bundlerConfig: null,
                              _chunks: {},
                              _partialRow: '',
                              _stringDecoder: {},
                            },
                          },
                        },
                        key: null,
                        ref: null,
                        props: {
                          layoutPath: '/dashboard',
                          childProp: {
                            current: null,
                            segment: 'page',
                          },
                        },
                        _owner: null,
                        _store: {},
                      },
                    ],
                    childNodes: new Map(),
                  },
                ],
              ]),
            },
          ],
        ]),
      },
    }

    const fetch = global.fetch
    global.fetch = jest.fn(() => new Promise(() => {}))

    const href = '/slow-page-with-loading'
    const url = new URL(href, 'http://localhost:3000')
    const segments = url.pathname.split('/')
    segments.push('page')
    const optimisticTree = createOptimisticTree(
      existingState,
      url,
      segments,
      existingState.tree,
      existingState.cache.childNodes,
      true,
      false
    )

    expect(existingState).toMatchSnapshot()

    expect(optimisticTree).toMatchSnapshot()

    global.fetch = fetch
  })
})
