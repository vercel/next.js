'use strict'

export const greet = formatGreeting
export const sayGoodbye = formatFarewell

async function formatGreeting(name: string) {
  'use cache'

  return `Hello, ${name}!`
}

export async function formatFarewell(name: string) {
  'use cache'

  return `Goodbye, ${name}!`
}
