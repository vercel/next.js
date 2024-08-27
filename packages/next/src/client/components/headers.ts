import { DraftMode } from './draft-mode'
import { getExpectedRequestStore } from './request-async-storage.external'

export function draftMode() {
  const callingExpression = 'draftMode'
  const requestStore = getExpectedRequestStore(callingExpression)

  return new DraftMode(requestStore.draftMode)
}
