import { createMachine } from 'xstate'

type ToggleContext = {
  value: 'inactive' | 'active'
}

type ToggleEvents = {
  type: 'TOGGLE'
}

export const toggleMachine = createMachine<ToggleContext, ToggleEvents>({
  predictableActionArguments: true,
  id: 'toggle',
  initial: 'inactive',
  states: {
    inactive: {
      on: { TOGGLE: 'active' },
    },
    active: {
      on: { TOGGLE: 'inactive' },
    },
  },
})
