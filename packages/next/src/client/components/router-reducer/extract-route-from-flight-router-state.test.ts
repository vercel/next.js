import type { FlightRouterState } from '../../../shared/lib/app-router-types'
import { extractRoutesFromFlightRouterState } from './extract-route-from-flight-router-state'

describe('extractRoutesFromFlightRouterState', () => {
  describe('Static Routes', () => {
    describe('Basic Static Segments', () => {
      it('should return "/" for root page', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: ['__PAGE__', {}, '/', undefined, true],
          },
          undefined,
          undefined,
          true,
        ]

        expect(extractRoutesFromFlightRouterState('/', tree)).toEqual(['/'])
      })

      it('should extract simple static route', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'about',
              {
                children: ['__PAGE__', {}, '/about'],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        expect(extractRoutesFromFlightRouterState('/about', tree)).toEqual([
          '/about',
        ])
      })

      it('should return empty array for non-matching pathname', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'about',
              {
                children: ['__PAGE__', {}, '/about'],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        expect(extractRoutesFromFlightRouterState('/contact', tree)).toEqual([])
      })

      it('should return empty array when searching for root page that does not exist', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'about',
              {
                children: ['__PAGE__', {}, '/about'],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        // Tree has /about but no root page - should return empty array
        expect(extractRoutesFromFlightRouterState('/', tree)).toEqual([])
      })
    })

    describe('Static Segments + Route Groups', () => {
      it('should preserve single route group', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              '(marketing)',
              {
                children: [
                  'about',
                  {
                    children: ['__PAGE__', {}, '/about'],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        expect(extractRoutesFromFlightRouterState('/about', tree)).toEqual([
          '/(marketing)/about',
        ])
      })

      it('should handle multiple nested route groups', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              '(app)',
              {
                children: [
                  '(dashboard)',
                  {
                    children: [
                      'settings',
                      {
                        children: ['__PAGE__', {}, '/settings'],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        expect(extractRoutesFromFlightRouterState('/settings', tree)).toEqual([
          '/(app)/(dashboard)/settings',
        ])
      })

      it('should handle consecutive route groups', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              '(root)',
              {
                children: [
                  '(auth)',
                  {
                    children: [
                      '(forms)',
                      {
                        children: [
                          'login',
                          {
                            children: ['__PAGE__', {}, '/login'],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        expect(extractRoutesFromFlightRouterState('/login', tree)).toEqual([
          '/(root)/(auth)/(forms)/login',
        ])
      })
    })
  })

  describe('Dynamic Routes', () => {
    describe('Dynamic Parameters ([param]) - Type: d', () => {
      it('should extract single dynamic parameter', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'blog',
              {
                children: [
                  ['slug', 'my-post', 'd'],
                  {
                    children: ['__PAGE__', {}, '/blog/my-post'],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        expect(
          extractRoutesFromFlightRouterState('/blog/my-post', tree)
        ).toEqual(['/blog/[slug]'])
      })

      it('should handle multiple nested dynamic parameters', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'shop',
              {
                children: [
                  ['category', 'electronics', 'd'],
                  {
                    children: [
                      ['product', 'laptop', 'd'],
                      {
                        children: ['__PAGE__', {}, '/shop/electronics/laptop'],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        expect(
          extractRoutesFromFlightRouterState('/shop/electronics/laptop', tree)
        ).toEqual(['/shop/[category]/[product]'])
      })

      it('should handle dynamic parameters with route groups', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              '(shop)',
              {
                children: [
                  ['category', 'electronics', 'd'],
                  {
                    children: [
                      ['product', 'laptop', 'd'],
                      {
                        children: ['__PAGE__', {}, '/electronics/laptop'],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        expect(
          extractRoutesFromFlightRouterState('/electronics/laptop', tree)
        ).toEqual(['/(shop)/[category]/[product]'])
      })
    })

    describe('Catch-all Parameters ([...param]) - Type: c', () => {
      it('should handle catch-all parameters', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'docs',
              {
                children: [
                  ['slug', 'api/reference', 'c'],
                  {
                    children: ['__PAGE__', {}, '/docs/api/reference'],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        expect(
          extractRoutesFromFlightRouterState('/docs/api/reference', tree)
        ).toEqual(['/docs/[...slug]'])
      })

      it('should handle catch-all at root level', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              ['path', 'blog/posts', 'c'],
              {
                children: ['__PAGE__', {}, '/blog/posts'],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        expect(extractRoutesFromFlightRouterState('/blog/posts', tree)).toEqual(
          ['/[...path]']
        )
      })
    })

    describe('Optional Catch-all Parameters ([[...param]]) - Type: oc', () => {
      it('should handle optional catch-all parameters', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'docs',
              {
                children: [
                  ['slug', 'api/reference', 'oc'],
                  {
                    children: ['__PAGE__', {}, '/docs/api/reference'],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        expect(
          extractRoutesFromFlightRouterState('/docs/api/reference', tree)
        ).toEqual(['/docs/[[...slug]]'])
      })

      it('should handle optional catch-all at root level', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              ['slug', 'about/team', 'oc'],
              {
                children: ['__PAGE__', {}, '/about/team'],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        expect(extractRoutesFromFlightRouterState('/about/team', tree)).toEqual(
          ['/[[...slug]]']
        )
      })
    })

    describe('Dynamic Intercepted Parameters - Type: di', () => {
      it('should handle interception folder with separate dynamic parameter', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'posts',
              {
                children: ['__PAGE__', {}, '/posts'],
                modal: [
                  '(slot)',
                  {
                    children: [
                      '(.)post',
                      {
                        children: [
                          ['slug', 'my-post', 'd'],
                          {
                            children: ['__PAGE__', {}, '/posts/post/my-post'],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        expect(
          extractRoutesFromFlightRouterState('/posts/post/my-post', tree)
        ).toEqual(['/posts/@modal/(.)post/[slug]'])
      })

      it('should handle combined interception marker + dynamic parameter folder', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'gallery',
              {
                modal: [
                  '(slot)',
                  {
                    children: [
                      '(group)',
                      {
                        children: [
                          ['id', '123', 'di(.)'],
                          {
                            children: ['__PAGE__', {}, '/gallery/123'],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        // (.)[id] is a SINGLE folder combining interception with dynamic param
        expect(
          extractRoutesFromFlightRouterState('/gallery/123', tree)
        ).toEqual(['/gallery/@modal/(group)/(.)[id]'])
      })

      it('should handle parent interception marker combined with dynamic parameter', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'store',
              {
                children: [
                  'catalog',
                  {
                    children: ['__PAGE__', {}, '/store/catalog'],
                    modal: [
                      '(slot)',
                      {
                        children: [
                          ['productId', '999', 'di(..)'],
                          {
                            children: ['__PAGE__', {}, '/store/999'],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        // (..)[productId] intercepts parent's dynamic segment
        expect(extractRoutesFromFlightRouterState('/store/999', tree)).toEqual([
          '/store/catalog/@modal/(..)[productId]',
        ])
      })

      it('should handle root interception marker combined with dynamic parameter', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'admin',
              {
                children: [
                  'panel',
                  {
                    children: ['__PAGE__', {}, '/admin/panel'],
                    overlay: [
                      '(slot)',
                      {
                        children: [
                          ['userId', '555', 'di(...)'],
                          {
                            children: ['__PAGE__', {}, '/555'],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        // (...)[userId] intercepts root's dynamic segment
        expect(extractRoutesFromFlightRouterState('/555', tree)).toEqual([
          '/admin/panel/@overlay/(...)[userId]',
        ])
      })
    })

    describe('Catch-all Intercepted Parameters - Type: ci', () => {
      it('should handle interception folder with separate catch-all parameter', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'wiki',
              {
                children: ['__PAGE__', {}, '/wiki'],
                modal: [
                  '(slot)',
                  {
                    children: [
                      '(.)docs',
                      {
                        children: [
                          ['path', 'getting-started/intro', 'c'],
                          {
                            children: [
                              '__PAGE__',
                              {},
                              '/wiki/docs/getting-started/intro',
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        expect(
          extractRoutesFromFlightRouterState(
            '/wiki/docs/getting-started/intro',
            tree
          )
        ).toEqual(['/wiki/@modal/(.)docs/[...path]'])
      })

      it('should handle combined interception marker + catch-all parameter folder', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'docs',
              {
                preview: [
                  '(slot)',
                  {
                    children: [
                      ['path', 'guides/intro', 'ci(.)'],
                      {
                        children: ['__PAGE__', {}, '/docs/guides/intro'],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        // (.)[...path] is a SINGLE folder combining interception with catch-all
        expect(
          extractRoutesFromFlightRouterState('/docs/guides/intro', tree)
        ).toEqual(['/docs/@preview/(.)[...path]'])
      })

      it('should handle two-level parent interception with catch-all', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'app',
              {
                children: [
                  'dashboard',
                  {
                    children: [
                      'settings',
                      {
                        children: ['__PAGE__', {}, '/app/dashboard/settings'],
                        docs: [
                          '(slot)',
                          {
                            children: [
                              ['path', 'api/reference/config', 'ci(..)(..)'],
                              {
                                children: [
                                  '__PAGE__',
                                  {},
                                  '/app/api/reference/config',
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        // (..)(..)[...path] intercepts two levels up with catch-all
        expect(
          extractRoutesFromFlightRouterState('/app/api/reference/config', tree)
        ).toEqual(['/app/dashboard/settings/@docs/(..)(..)[...path]'])
      })

      it('should handle root-level interception with catch-all', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'admin',
              {
                children: [
                  'panel',
                  {
                    children: [
                      'users',
                      {
                        children: ['__PAGE__', {}, '/admin/panel/users'],
                        help: [
                          '(slot)',
                          {
                            children: [
                              ['segments', 'docs/faq/account', 'ci(...)'],
                              {
                                children: ['__PAGE__', {}, '/docs/faq/account'],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        // (...)[...segments] intercepts from root with catch-all
        expect(
          extractRoutesFromFlightRouterState('/docs/faq/account', tree)
        ).toEqual(['/admin/panel/users/@help/(...)[...segments]'])
      })
    })
  })

  describe('Parallel Routes', () => {
    describe('Basic Parallel Routes (@slot)', () => {
      it('should handle root-level parallel routes', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: ['__PAGE__', {}, '/'],
            modal: [
              '(slot)',
              {
                children: [
                  'login',
                  {
                    children: ['__PAGE__', {}, '/login'],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        expect(extractRoutesFromFlightRouterState('/login', tree)).toEqual([
          '/@modal/login',
        ])
      })

      it('should match non-children parallel route when children does not match', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'app',
              {
                children: ['__PAGE__', {}, '/app'],
                sidebar: [
                  'nav',
                  {
                    children: ['__PAGE__', {}, '/app/nav'],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        // /app/nav doesn't exist in children, but exists in sidebar
        expect(extractRoutesFromFlightRouterState('/app/nav', tree)).toEqual([
          '/app/@sidebar/nav',
        ])
      })

      it('should handle parallel route with independent page at slot level', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'gallery',
              {
                children: [
                  ['id', '123', 'd'],
                  {
                    children: ['__PAGE__', {}, '/gallery/123'],
                  },
                ],
                modal: [
                  '(slot)',
                  {
                    children: ['__PAGE__', {}, '/gallery/modal'],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        // Modal has its own page at /gallery/modal (no dynamic segment)
        expect(
          extractRoutesFromFlightRouterState('/gallery/modal', tree)
        ).toEqual(['/gallery/@modal'])
      })

      it('should filter synthetic (slot) segments after parallel routes', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'see',
              {
                children: ['__PAGE__', {}, '/see'],
                modal: [
                  '(slot)', // synthetic segment - should be skipped
                  {
                    children: ['__PAGE__', {}, '/see'],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        // Both children and modal match - both should be returned
        // The (slot) segment is synthetic and should be filtered out from modal route
        expect(extractRoutesFromFlightRouterState('/see', tree)).toEqual([
          '/see',
          '/see/@modal',
        ])
      })
    })

    describe('Parallel Routes Priority', () => {
      it('should prioritize children route over named slots', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'dashboard',
              {
                children: ['__PAGE__', {}, '/dashboard'],
                sidebar: [
                  '(nav)',
                  {
                    children: ['__PAGE__', {}, '/dashboard'],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        // Both children and sidebar match - both should be returned
        expect(extractRoutesFromFlightRouterState('/dashboard', tree)).toEqual([
          '/dashboard',
          '/dashboard/@sidebar/(nav)',
        ])
      })

      it('should handle multiple named slots with first match winning', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'dashboard',
              {
                children: ['__PAGE__', {}, '/dashboard'],
                analytics: [
                  'chart',
                  {
                    children: ['__PAGE__', {}, '/dashboard/chart'],
                  },
                ],
                sidebar: [
                  'chart',
                  {
                    children: ['__PAGE__', {}, '/dashboard/chart'],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        // Both analytics and sidebar have 'chart' - both should be returned
        const result = extractRoutesFromFlightRouterState(
          '/dashboard/chart',
          tree
        )
        expect(result).toEqual([
          '/dashboard/@analytics/chart',
          '/dashboard/@sidebar/chart',
        ])
      })
    })

    describe('Nested Parallel Routes', () => {
      it('should handle parallel routes at multiple nested levels', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'app',
              {
                children: [
                  'dashboard',
                  {
                    children: ['__PAGE__', {}, '/app/dashboard'],
                    panel: [
                      'stats',
                      {
                        children: ['__PAGE__', {}, '/app/dashboard/stats'],
                        chart: [
                          'line',
                          {
                            children: [
                              '__PAGE__',
                              {},
                              '/app/dashboard/stats/line',
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        expect(
          extractRoutesFromFlightRouterState('/app/dashboard/stats/line', tree)
        ).toEqual(['/app/dashboard/@panel/stats/@chart/line'])
      })

      it('should handle parallel routes with different depths', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'app',
              {
                children: [
                  'level1',
                  {
                    children: [
                      'level2',
                      {
                        children: [
                          'level3',
                          {
                            children: [
                              '__PAGE__',
                              {},
                              '/app/level1/level2/level3',
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
                shortcut: [
                  'direct',
                  {
                    children: ['__PAGE__', {}, '/app/direct'],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        // shortcut route is much shorter than children route
        expect(extractRoutesFromFlightRouterState('/app/direct', tree)).toEqual(
          ['/app/@shortcut/direct']
        )
      })
    })

    describe('Parallel Routes + Dynamic Segments', () => {
      it('should handle dynamic segment in both children and parallel route', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'test',
              {
                children: [
                  ['id', '123', 'd'],
                  {
                    children: ['__PAGE__', {}, '/test/123'],
                  },
                ],
                modal: [
                  '(slot)',
                  {
                    children: [
                      ['id', '123', 'd'],
                      {
                        children: ['__PAGE__', {}, '/test/123'],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        // Both children and modal have [id] - both should be returned
        expect(extractRoutesFromFlightRouterState('/test/123', tree)).toEqual([
          '/test/[id]',
          '/test/@modal/[id]',
        ])
      })

      it('should match parallel route when children has different dynamic segment', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'test',
              {
                children: [
                  ['productId', '456', 'd'],
                  {
                    children: ['__PAGE__', {}, '/test/product/456'],
                  },
                ],
                modal: [
                  '(slot)',
                  {
                    children: [
                      ['itemId', '123', 'd'],
                      {
                        children: ['__PAGE__', {}, '/test/123'],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        // /test/123 matches modal's [itemId], not children's [productId]
        expect(extractRoutesFromFlightRouterState('/test/123', tree)).toEqual([
          '/test/@modal/[itemId]',
        ])
      })

      it('should handle dynamic parameters with parallel routes', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'see',
              {
                children: ['__PAGE__', {}, '/see'],
                modal: [
                  '(slot)',
                  {
                    children: [
                      '(group)',
                      {
                        children: [
                          ['guid', '14CE0C38-483F-42F0-B2DF-4B1E23C20EFE', 'd'],
                          {
                            children: [
                              '__PAGE__',
                              {},
                              '/see/14CE0C38-483F-42F0-B2DF-4B1E23C20EFE',
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        expect(
          extractRoutesFromFlightRouterState(
            '/see/14CE0C38-483F-42F0-B2DF-4B1E23C20EFE',
            tree
          )
        ).toEqual(['/see/@modal/(group)/[guid]'])
      })

      it('should handle catch-all before parallel route', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              ['path', 'blog/posts', 'c'],
              {
                children: ['__PAGE__', {}, '/blog/posts'],
                sidebar: [
                  'nav',
                  {
                    children: ['__PAGE__', {}, '/blog/posts/nav'],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        expect(
          extractRoutesFromFlightRouterState('/blog/posts/nav', tree)
        ).toEqual(['/[...path]/@sidebar/nav'])
      })

      it('should handle optional catch-all before parallel route', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              ['path', 'docs', 'oc'],
              {
                children: ['__PAGE__', {}, '/docs'],
                toc: [
                  'sidebar',
                  {
                    children: ['__PAGE__', {}, '/docs/sidebar'],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        expect(
          extractRoutesFromFlightRouterState('/docs/sidebar', tree)
        ).toEqual(['/[[...path]]/@toc/sidebar'])
      })
    })

    describe('Parallel Routes + Route Groups', () => {
      it('should preserve user-defined (slot) route groups vs synthetic', () => {
        // Test case: @modal/(group)/(slot)/[id] where the second (slot) is user-defined
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'product',
              {
                children: ['__PAGE__', {}, '/product'],
                modal: [
                  '(slot)', // synthetic - should be skipped
                  {
                    children: [
                      '(group)',
                      {
                        children: [
                          '(slot)', // user-defined - should be preserved!
                          {
                            children: [
                              ['id', '123', 'd'],
                              {
                                children: ['__PAGE__', {}, '/product/123'],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        // The first (slot) is synthetic (right after @modal) - skip it
        // The second (slot) is user-defined (after (group)) - keep it
        expect(
          extractRoutesFromFlightRouterState('/product/123', tree)
        ).toEqual(['/product/@modal/(group)/(slot)/[id]'])
      })

      it('should handle route group before parallel route', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              '(app)',
              {
                children: [
                  'dashboard',
                  {
                    children: ['__PAGE__', {}, '/dashboard'],
                    panel: [
                      'stats',
                      {
                        children: ['__PAGE__', {}, '/dashboard/stats'],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        expect(
          extractRoutesFromFlightRouterState('/dashboard/stats', tree)
        ).toEqual(['/(app)/dashboard/@panel/stats'])
      })
    })

    describe('Parallel Routes Edge Cases', () => {
      it('should return null when no parallel routes match', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'app',
              {
                children: ['__PAGE__', {}, '/app'],
                sidebar: [
                  'nav',
                  {
                    children: ['__PAGE__', {}, '/app/nav'],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        // /app/settings doesn't exist in any parallel route
        expect(
          extractRoutesFromFlightRouterState('/app/settings', tree)
        ).toEqual([])
      })
    })
  })

  describe('Interception Routes', () => {
    describe('Same-level Interception (.) - Separate Folders', () => {
      it('should preserve same-level interception marker', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'feed',
              {
                children: ['__PAGE__', {}, '/feed'],
                modal: [
                  '(slot)',
                  {
                    children: [
                      '(.)photo',
                      {
                        children: [
                          ['id', '123', 'd'],
                          {
                            children: ['__PAGE__', {}, '/feed/photo/123'],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        expect(
          extractRoutesFromFlightRouterState('/feed/photo/123', tree)
        ).toEqual(['/feed/@modal/(.)photo/[id]'])
      })

      it('should handle interception with catch-all parameters', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'blog',
              {
                children: ['__PAGE__', {}, '/blog'],
                modal: [
                  '(slot)',
                  {
                    children: [
                      '(.)docs',
                      {
                        children: [
                          ['slug', 'api/reference/config', 'c'],
                          {
                            children: [
                              '__PAGE__',
                              {},
                              '/blog/docs/api/reference/config',
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        expect(
          extractRoutesFromFlightRouterState(
            '/blog/docs/api/reference/config',
            tree
          )
        ).toEqual(['/blog/@modal/(.)docs/[...slug]'])
      })

      it('should handle interception with route groups', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'gallery',
              {
                children: ['__PAGE__', {}, '/gallery'],
                modal: [
                  '(slot)',
                  {
                    children: [
                      '(.)(modal-group)',
                      {
                        children: [
                          ['id', '999', 'd'],
                          {
                            children: ['__PAGE__', {}, '/gallery/999'],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        expect(
          extractRoutesFromFlightRouterState('/gallery/999', tree)
        ).toEqual(['/gallery/@modal/(.)(modal-group)/[id]'])
      })
    })

    describe('Same-level Interception (.) - Combined with Dynamic', () => {
      it('should handle interception marker combined with dynamic parameter', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'gallery',
              {
                modal: [
                  '(slot)',
                  {
                    children: [
                      '(group)',
                      {
                        children: [
                          ['id', '123', 'di(.)'],
                          {
                            children: ['__PAGE__', {}, '/gallery/123'],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        // (.)[id] is a single segment combining interception with dynamic param
        expect(
          extractRoutesFromFlightRouterState('/gallery/123', tree)
        ).toEqual(['/gallery/@modal/(group)/(.)[id]'])
      })

      it('should handle interception marker combined with catch-all parameter', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'docs',
              {
                children: ['__PAGE__', {}, '/docs'],
                preview: [
                  '(slot)',
                  {
                    children: [
                      ['path', 'guides/intro', 'ci(.)'],
                      {
                        children: ['__PAGE__', {}, '/docs/guides/intro'],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        // (.)[...path] is interception marker combined with catch-all
        expect(
          extractRoutesFromFlightRouterState('/docs/guides/intro', tree)
        ).toEqual(['/docs/@preview/(.)[...path]'])
      })
    })

    describe('Parent-level Interception (..) - Separate Folders', () => {
      it('should preserve parent-level interception marker', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'app',
              {
                children: [
                  'feed',
                  {
                    children: ['__PAGE__', {}, '/app/feed'],
                    modal: [
                      '(slot)',
                      {
                        children: [
                          '(..)photo',
                          {
                            children: [
                              ['id', '456', 'd'],
                              {
                                children: ['__PAGE__', {}, '/app/photo/456'],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        expect(
          extractRoutesFromFlightRouterState('/app/photo/456', tree)
        ).toEqual(['/app/feed/@modal/(..)photo/[id]'])
      })

      it('should handle interception with optional catch-all', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'docs',
              {
                children: ['__PAGE__', {}, '/docs'],
                modal: [
                  '(slot)',
                  {
                    children: [
                      '(..)preview',
                      {
                        children: [
                          ['slug', 'api/components', 'oc'],
                          {
                            children: [
                              '__PAGE__',
                              {},
                              '/preview/api/components',
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        expect(
          extractRoutesFromFlightRouterState('/preview/api/components', tree)
        ).toEqual(['/docs/@modal/(..)preview/[[...slug]]'])
      })
    })

    describe('Parent-level Interception (..) - Combined with Dynamic', () => {
      it('should handle parent interception marker combined with dynamic parameter', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'store',
              {
                children: [
                  'catalog',
                  {
                    children: ['__PAGE__', {}, '/store/catalog'],
                    modal: [
                      '(slot)',
                      {
                        children: [
                          ['productId', '999', 'di(..)'],
                          {
                            children: ['__PAGE__', {}, '/store/999'],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        // (..)[productId] intercepts parent's dynamic segment
        expect(extractRoutesFromFlightRouterState('/store/999', tree)).toEqual([
          '/store/catalog/@modal/(..)[productId]',
        ])
      })
    })

    describe('Root-level Interception (...) - Separate Folders', () => {
      it('should preserve root-level interception marker', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'dashboard',
              {
                children: [
                  'settings',
                  {
                    children: ['__PAGE__', {}, '/dashboard/settings'],
                    modal: [
                      '(slot)',
                      {
                        children: [
                          '(...)photo',
                          {
                            children: [
                              ['id', '789', 'd'],
                              {
                                children: ['__PAGE__', {}, '/photo/789'],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        expect(extractRoutesFromFlightRouterState('/photo/789', tree)).toEqual([
          '/dashboard/settings/@modal/(...)photo/[id]',
        ])
      })
    })

    describe('Root-level Interception (...) - Combined with Dynamic', () => {
      it('should handle root interception marker combined with dynamic parameter', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'admin',
              {
                children: [
                  'panel',
                  {
                    children: ['__PAGE__', {}, '/admin/panel'],
                    overlay: [
                      '(slot)',
                      {
                        children: [
                          ['userId', '555', 'di(...)'],
                          {
                            children: ['__PAGE__', {}, '/555'],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        // (...)[userId] intercepts root's dynamic segment
        expect(extractRoutesFromFlightRouterState('/555', tree)).toEqual([
          '/admin/panel/@overlay/(...)[userId]',
        ])
      })
    })

    describe('Multiple-level Interception', () => {
      it('should handle two-level interception marker (..)(..)', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'app',
              {
                children: [
                  'dashboard',
                  {
                    children: [
                      'deep',
                      {
                        children: ['__PAGE__', {}, '/app/dashboard/deep'],
                        modal: [
                          '(slot)',
                          {
                            children: [
                              '(..)(..)photo',
                              {
                                children: [
                                  ['id', 'abc', 'd'],
                                  {
                                    children: [
                                      '__PAGE__',
                                      {},
                                      '/app/photo/abc',
                                    ],
                                  },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        expect(
          extractRoutesFromFlightRouterState('/app/photo/abc', tree)
        ).toEqual(['/app/dashboard/deep/@modal/(..)(..)photo/[id]'])
      })

      it('should handle three-level interception marker (..)(..)(..)', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'app',
              {
                children: [
                  'level1',
                  {
                    children: [
                      'level2',
                      {
                        children: [
                          'level3',
                          {
                            children: [
                              '__PAGE__',
                              {},
                              '/app/level1/level2/level3',
                            ],
                            modal: [
                              '(slot)',
                              {
                                children: [
                                  '(..)(..)(..)photo',
                                  {
                                    children: [
                                      ['id', '999', 'd'],
                                      {
                                        children: [
                                          '__PAGE__',
                                          {},
                                          '/photo/999',
                                        ],
                                      },
                                    ],
                                  },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        expect(extractRoutesFromFlightRouterState('/photo/999', tree)).toEqual([
          '/app/level1/level2/level3/@modal/(..)(..)(..)photo/[id]',
        ])
      })
    })

    describe('Optional Catch-all in Parallel Routes', () => {
      it('should handle optional catch-all parameter in parallel route', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'wiki',
              {
                children: ['__PAGE__', {}, '/wiki'],
                sidebar: [
                  '(slot)',
                  {
                    children: [
                      ['segments', 'advanced/routing', 'oc'],
                      {
                        children: ['__PAGE__', {}, '/wiki/advanced/routing'],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        // Note: This is 'oc' type (optional catch-all), NOT 'oci' type.
        // Interception markers combined with optional catch-all (oci) are not
        // currently supported in the type system - only separate interception
        // folders with optional catch-all segments are possible.
        expect(
          extractRoutesFromFlightRouterState('/wiki/advanced/routing', tree)
        ).toEqual(['/wiki/@sidebar/[[...segments]]'])
      })
    })
  })

  describe('Complex Multi-Feature Combinations', () => {
    describe('Route Groups + Dynamic + Parallel', () => {
      it('should handle route groups + dynamic params + parallel routes', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              '(shop)',
              {
                children: [
                  ['category', 'electronics', 'd'],
                  {
                    children: [
                      ['product', 'laptop', 'd'],
                      {
                        children: ['__PAGE__', {}, '/electronics/laptop'],
                        reviews: [
                          'list',
                          {
                            children: [
                              '__PAGE__',
                              {},
                              '/electronics/laptop/reviews',
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        expect(
          extractRoutesFromFlightRouterState(
            '/electronics/laptop/reviews',
            tree
          )
        ).toEqual(['/(shop)/[category]/[product]/@reviews/list'])
      })
    })

    describe('Multiple Dynamic + Parallel + Interception', () => {
      it('should handle multiple dynamic params + parallel + interception', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              ['locale', 'en', 'd'],
              {
                children: [
                  'photos',
                  {
                    children: [
                      ['id', '123', 'd'],
                      {
                        children: ['__PAGE__', {}, '/en/photos/123'],
                      },
                    ],
                    modal: [
                      '(slot)',
                      {
                        children: [
                          '(.)photo',
                          {
                            children: [
                              ['photoId', '456', 'd'],
                              {
                                children: ['__PAGE__', {}, '/en/photos/456'],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        expect(
          extractRoutesFromFlightRouterState('/en/photos/456', tree)
        ).toEqual(['/[locale]/photos/@modal/(.)photo/[photoId]'])
      })

      it('should handle multiple dynamic params before parallel + interception', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              ['locale', 'en', 'd'],
              {
                children: [
                  ['region', 'us', 'd'],
                  {
                    children: [
                      'blog',
                      {
                        children: ['__PAGE__', {}, '/en/us/blog'],
                        modal: [
                          '(slot)',
                          {
                            children: [
                              '(.)post',
                              {
                                children: [
                                  ['id', '123', 'd'],
                                  {
                                    children: [
                                      '__PAGE__',
                                      {},
                                      '/en/us/blog/post/123',
                                    ],
                                  },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        expect(
          extractRoutesFromFlightRouterState('/en/us/blog/post/123', tree)
        ).toEqual(['/[locale]/[region]/blog/@modal/(.)post/[id]'])
      })
    })

    describe('Route Groups + Interception + Multiple Dynamic', () => {
      it('should handle interception + multiple route groups + dynamic params', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              '(marketing)',
              {
                children: [
                  'products',
                  {
                    children: ['__PAGE__', {}, '/products'],
                    modal: [
                      '(slot)',
                      {
                        children: [
                          '(.)(modal-layout)',
                          {
                            children: [
                              '(modal-content)',
                              {
                                children: [
                                  ['productId', 'abc123', 'd'],
                                  {
                                    children: [
                                      '__PAGE__',
                                      {},
                                      '/products/abc123',
                                    ],
                                  },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        expect(
          extractRoutesFromFlightRouterState('/products/abc123', tree)
        ).toEqual([
          '/(marketing)/products/@modal/(.)(modal-layout)/(modal-content)/[productId]',
        ])
      })
    })
  })

  describe('Edge Cases & Special Behaviors', () => {
    describe('Client-Side Navigation (null/undefined URLs)', () => {
      it('should match page with null URL (active page during navigation)', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'products',
              {
                children: [
                  ['id', '123', 'd'],
                  {
                    children: ['__PAGE__', {}, null], // null URL during client navigation
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        expect(
          extractRoutesFromFlightRouterState('/products/123', tree)
        ).toEqual(['/products/[id]'])
      })

      it('should match page with undefined URL', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'blog',
              {
                children: [
                  ['slug', 'my-post', 'd'],
                  {
                    children: ['__PAGE__', {}, undefined], // undefined URL
                  },
                ],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        expect(
          extractRoutesFromFlightRouterState('/blog/my-post', tree)
        ).toEqual(['/blog/[slug]'])
      })
    })

    describe('Empty Structures', () => {
      it('should handle empty parallel routes object', () => {
        const tree: FlightRouterState = [
          '',
          {
            children: [
              'page',
              {
                children: ['__PAGE__', {}, '/page'],
              },
            ],
          },
          undefined,
          undefined,
          true,
        ]

        expect(extractRoutesFromFlightRouterState('/page', tree)).toEqual([
          '/page',
        ])
      })
    })
  })
})
