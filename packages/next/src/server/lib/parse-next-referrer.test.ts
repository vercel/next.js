import { extractPathFromFlightRouterState } from './parse-next-referrer'

describe('extractPathFromFlightRouterState', () => {
  it('should return the correct referrer for a simple router state', () => {
    expect(
      extractPathFromFlightRouterState([
        '',
        {
          children: [
            'parallel-tab-bar',
            {
              views: ['impressions', { children: ['__PAGE__', {}] }],
              children: ['__DEFAULT__', {}],
              audience: ['__DEFAULT__', {}],
            },
          ],
        },
        null,
        null,
        true,
      ])
    ).toBe('/parallel-tab-bar/impressions')
  })
  it('should return the correct referrer for a router state with an interception', () => {
    expect(
      extractPathFromFlightRouterState([
        '',
        {
          children: [
            'intercepting-parallel-modal',
            {
              children: [
                ['username', 'jim', 'd'],
                {
                  children: ['__PAGE__', {}],
                  modal: [
                    '(..)photo',
                    {
                      children: [
                        ['id', '0', 'd'],
                        { children: ['__PAGE__', {}] },
                      ],
                    },
                    null,
                    'refetch',
                  ],
                },
              ],
            },
          ],
        },
      ])
    ).toBe('/intercepting-parallel-modal/jim')
  })
  it('should return the correct referrer for a router state with a nested interception', () => {
    expect(
      extractPathFromFlightRouterState([
        '',
        {
          children: [
            'intercepting-parallel-modal',
            {
              children: [
                ['username', 'jim', 'd'],
                {
                  children: ['__PAGE__', {}],
                  modal: [
                    '(..)photo',
                    {
                      children: [
                        ['id', '0', 'd'],
                        { children: ['__PAGE__', {}] },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        null,
        null,
        true,
      ])
    ).toBe('/intercepting-parallel-modal/jim')
  })
  it('should return the correct referrer for a router state with a default children', () => {
    expect(
      extractPathFromFlightRouterState([
        '',
        {
          children: [
            'parallel-tab-bar',
            {
              audience: ['subscribers', { children: ['__PAGE__', {}] }],
              children: ['__DEFAULT__', {}],
              views: ['__DEFAULT__', {}],
            },
          ],
        },
        null,
        null,
        true,
      ])
    ).toBe('/parallel-tab-bar/subscribers')
  })
})
