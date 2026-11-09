import { requestStore } from '../request-store'

// What the top-level code of this module finds in the async context that it is evaluated in.
export const atEvaluation = requestStore.getStore() ?? null
