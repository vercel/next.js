import { mockFleurContext, mockStore } from '@fleur/testing'
import { TimerActions, TimerOps, TimerSelector, TimerStore } from './timer'

describe('timer', () => {
  const baseContext = mockFleurContext({ stores: [mockStore(TimerStore)] })

  describe('Opration', () => {
    it('tick', async () => {
      const context = baseContext.derive().mockOperationContext()

      const lastUpdate = Date.now()
      context.executeOperation(TimerOps.tick, { light: true, lastUpdate })

      expect(context.dispatches[0].action).toBe(TimerActions.tick)
      expect(context.dispatches[0].payload).toMatchObject({
        light: true,
        lastUpdate,
      })
    })
  })

  describe('Store', () => {
    it('tick to change lastUpdate', async () => {
      const context = baseContext
        .derive(({ deriveStore }) => {
          deriveStore(TimerStore, { lastUpdate: 0 })
        })
        .mockOperationContext()

      const lastUpdate = Date.now()
      context.dispatch(TimerActions.tick, { light: true, lastUpdate })

      const state = context.getStore(TimerStore).state
      expect(state.light).toBe(true)
      expect(state.lastUpdate).toBe(lastUpdate)
    })
  })

  describe('Selectors', () => {
    it('getCount', () => {
      const context = baseContext.derive(({ deriveStore }) => {
        deriveStore(TimerStore, { count: 100 })
      })

      const actual = TimerSelector.getCount(context.getStore)
      expect(actual).toBe(100)
    })
  })
})
