import type { FlightRouterState } from '../../../shared/lib/app-router-types'
import { isNavigatingToNewRootLayout } from './is-navigating-to-new-root-layout'

describe('isNavigatingToNewRootLayout', () => {
  it('should return false if there is no new root layout', () => {
    const getInitialRouterStateTree = (): FlightRouterState => [
      '',
      {
        children: [
          'linking',
          {
            children: ['', {}],
          },
        ],
      },
      undefined,
      undefined,
      true,
    ]
    const initialRouterStateTree = getInitialRouterStateTree()
    const getNewRouterStateTree = (): FlightRouterState => {
      return [
        '',
        {
          children: [
            'link-hard-push',
            {
              children: [
                ['id', '456', 'd'],
                {
                  children: ['', {}],
                },
              ],
            },
          ],
        },
        null,
        null,
        true,
      ]
    }
    const newRouterState = getNewRouterStateTree()

    const result = isNavigatingToNewRootLayout(
      newRouterState,
      initialRouterStateTree
    )

    expect(result).toBe(false)
  })

  it('should return true if there is a mismatch between the root layouts', () => {
    const getInitialRouterStateTree = (): FlightRouterState => [
      '',
      {
        children: [
          'linking',
          {
            children: ['', {}],
          },
          undefined,
          undefined,
          // Root layout at `linking` level.
          true,
        ],
      },
    ]
    const initialRouterStateTree = getInitialRouterStateTree()
    const getNewRouterStateTree = (): FlightRouterState => {
      return [
        '',
        {
          children: [
            'link-hard-push',
            {
              children: [
                ['id', '456', 'd'],
                {
                  children: ['', {}],
                },
              ],
            },
            null,
            null,
            // Root layout at `link-hard-push` level.
            true,
          ],
        },
      ]
    }
    const newRouterState = getNewRouterStateTree()

    const result = isNavigatingToNewRootLayout(
      newRouterState,
      initialRouterStateTree
    )

    expect(result).toBe(true)
  })
})
