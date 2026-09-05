import {
  computeChangedPath,
  getSelectedParams,
  segmentToSourcePagePathname,
} from './compute-changed-path'
import {
  type DynamicParamTypesShort,
  type FlightRouterState,
  type Segment,
  PrefetchHint,
} from '../../../shared/lib/app-router-types'

describe('computeChangedPath', () => {
  const sourceRouteSegmentCases: Array<[Segment, string]> = [
    [['slug', 'hello', 'd', null], '[slug]'],
    [['slug', 'hello', 'c', null], '[...slug]'],
    [['slug', 'hello', 'oc', null], '[[...slug]]'],
    [['slug', 'hello', 'di(.)', null], '(.)[slug]'],
    [['slug', 'hello', 'di(..)', null], '(..)[slug]'],
    [['slug', 'hello', 'di(..)(..)', null], '(..)(..)[slug]'],
    [['slug', 'hello', 'di(...)', null], '(...)[slug]'],
    [['slug', 'hello', 'ci(.)', null], '(.)[...slug]'],
    [['slug', 'hello', 'ci(..)', null], '(..)[...slug]'],
    [['slug', 'hello', 'ci(..)(..)', null], '(..)(..)[...slug]'],
    [['slug', 'hello', 'ci(...)', null], '(...)[...slug]'],
  ]

  it.each(sourceRouteSegmentCases)(
    'formats source route segment %j as %s',
    (segment, expected) => {
      expect(segmentToSourcePagePathname(segment)).toBe(expected)
    }
  )

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
          PrefetchHint.IsRootLayoutOrAbove,
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
          PrefetchHint.IsRootLayoutOrAbove,
        ]
      )
    ).toBe('/')
  })
})

describe('getSelectedParams', () => {
  const interceptedCatchAllTypes = [
    'ci(.)',
    'ci(..)',
    'ci(..)(..)',
    'ci(...)',
  ] satisfies DynamicParamTypesShort[]

  it.each(interceptedCatchAllTypes)(
    'returns %s params as an array',
    (paramType) => {
      const tree: FlightRouterState = [
        '',
        {
          children: [
            ['slug', 'a/b', paramType, null],
            { children: ['__PAGE__', {}] },
          ],
        },
      ]

      expect(getSelectedParams(tree)).toEqual({ slug: ['a', 'b'] })
    }
  )
})
