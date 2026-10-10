'use client'

export const INITIAL_MESSAGE = '(no message)'

// Lets the other page write state into the kept (hidden but still mounted)
// page, the same way an external store would.
let setMessage: ((message: string) => void) | null = null

export function registerMessageSetter(setter: (message: string) => void) {
  setMessage = setter
}

export function setMessageOnKeptPage(message: string) {
  setMessage?.(message)
}
