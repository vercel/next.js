import React from 'react'
import {
  // isHydrationError,
  getDefaultHydrationErrorMessage,
} from '../is-hydration-error'
import {
  // hydrationErrorState,
  type HydrationErrorState,
  getReactHydrationDiffSegments,
} from './hydration-error-info'

export function attachHydrationErrorState(
  error: Error,
  hydrationErrorStatePayload: HydrationErrorState | null
) {
  // console.log('attachHydrationErrorState', isHydrationError(error))
  // if (
  //   isHydrationError(error) // &&
  //   // !error.message.includes(
  //   //   'https://nextjs.org/docs/messages/react-hydration-error'
  //   // )
  // ) {
  // }

  const reactHydrationDiffSegments = getReactHydrationDiffSegments(
    error.message
  )

  // if it's hydration warning
  let parsedHydrationErrorState: HydrationErrorState = {}
  let warning: [string, string, string] = ['', '', '']
  let parsedComponentStack =
    (error as any)._componentStack ||
    (React.captureOwnerStack ? React.captureOwnerStack() : '')
  if (reactHydrationDiffSegments) {
    if (hydrationErrorStatePayload?.warning) {
      // If it's from console.error, read the warning from parsed console.error message
      warning = hydrationErrorStatePayload.warning
    } else {
      const components = []
      // If the react hydration diff is from the error message itself, extract it from the message.
      // Extract the `> <text>` or `+/- <text>` from the line as first or second content.
      const diff = reactHydrationDiffSegments[1]
      const diffLines = diff.split('\n')
      let firstContent = ''
      let secondContent = ''
      for (let line of diffLines) {
        line = line.trim()

        if (/^[>+-]\s/.test(line)) {
          const content = line.slice(2)
          if (!firstContent) {
            firstContent = content
          } else if (!secondContent) {
            secondContent = content
          }
        }

        if (line !== '...' && !line.startsWith('+') && !line.startsWith('-')) {
          if (line.startsWith('> ')) {
            line = line.slice(2).trim()
          }
          components.push(line.replace(/<|>/g, ''))
        }
      }
      if (!parsedComponentStack) {
        parsedComponentStack = components
          .map((component) => {
            return 'at ' + component + ' (<anonymous>)'
          })
          .join('\n')
      }
      warning = [getDefaultHydrationErrorMessage(), firstContent, secondContent]
    }
    // console.log('componentStackFromDiff', parsedComponentStack)
    parsedHydrationErrorState = {
      warning: warning,
      notes:
        warning[0] === getDefaultHydrationErrorMessage()
          ? reactHydrationDiffSegments[0]
          : '',
      componentStack: parsedComponentStack,
      reactOutputComponentDiff: reactHydrationDiffSegments[1],
    }
  } else {
    // If there's any extra information in the error message to display,
    // append it to the error message details property
    if (hydrationErrorStatePayload?.warning) {
      // The patched console.error found hydration errors logged by React
      // Append the logged warning to the error message
      parsedHydrationErrorState = {
        // ...(error as any).details,
        // It contains the warning, component stack, server and client tag names
        ...hydrationErrorStatePayload,
        componentStack: parsedComponentStack,
      }
      console.log(
        'parsedHydrationErrorState 2',
        parsedHydrationErrorState,
        reactHydrationDiffSegments
      )
    }
  }
  ;(error as any).details = parsedHydrationErrorState
}
