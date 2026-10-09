import { value } from './dependency'

globalThis.__nextMockSetup = {
  calls: (globalThis.__nextMockSetup?.calls || 0) + 1,
  value,
}
