import { appPathsToRouterState } from './on-demand-entry-handler'

describe('appPathsToRouterState', () => {
  it('handles parallelRoutes starting with @', () => {
    expect(appPathsToRouterState(['/page', '/@other/page'])).toEqual([
      '',
      {
        children: ['__PAGE__', {}],
        other: [
          'page$',
          {
            children: ['__PAGE__', {}],
          },
        ],
      },
      undefined,
      undefined,
      true,
    ])
  })
})
