import { htmlEscapeJsonString } from './htmlescape'

export const INLINE_FLIGHT_PAYLOAD_BOOTSTRAP = 0
export const INLINE_FLIGHT_PAYLOAD_DATA = 1
export const INLINE_FLIGHT_PAYLOAD_FORM_STATE = 2
export const INLINE_FLIGHT_PAYLOAD_BINARY = 3

export function createInitialInlinedFlightDataScriptContent(
  formState: unknown | null
): string {
  let scriptContents = `(self.__next_f=self.__next_f||[]).push(${htmlEscapeJsonString(
    JSON.stringify([INLINE_FLIGHT_PAYLOAD_BOOTSTRAP])
  )})`

  if (formState != null) {
    scriptContents += `;self.__next_f.push(${htmlEscapeJsonString(
      JSON.stringify([INLINE_FLIGHT_PAYLOAD_FORM_STATE, formState])
    )})`
  }

  return scriptContents
}
