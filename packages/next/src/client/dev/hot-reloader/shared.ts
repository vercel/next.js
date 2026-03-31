import type { HmrMessageSentToBrowser } from '../../../server/dev/hot-reloader-types'

export const REACT_REFRESH_FULL_RELOAD =
  '[Fast Refresh] performing full reload\n\n' +
  "Fast Refresh will perform a full reload when you edit a file that's imported by modules outside of the React rendering tree.\n" +
  'You might have a file which exports a React component but also exports a value that is imported by a non-React component file.\n' +
  'Consider migrating the non-React component export to a separate file and importing it into both files.\n\n' +
  'It is also possible the parent component of the component you edited is a class component, which disables Fast Refresh.\n' +
  'Fast Refresh requires at least one parent function component in your React tree.'

export const REACT_REFRESH_FULL_RELOAD_FROM_ERROR =
  '[Fast Refresh] performing full reload because your application had an unrecoverable error'

export function reportInvalidHmrMessage(
  message: HmrMessageSentToBrowser | MessageEvent<unknown>,
  err: unknown
) {
  console.warn(
    '[HMR] Invalid message: ' +
      JSON.stringify(message) +
      '\n' +
      ((err instanceof Error && err?.stack) || '')
  )
}
