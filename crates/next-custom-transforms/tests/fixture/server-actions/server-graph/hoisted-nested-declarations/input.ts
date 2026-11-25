'use strict'

export const runServer = inlineAction
export const runDefault = defaultCached

async function inlineAction(value: string) {
  'use server'

  return value
}

export default async function defaultCached() {
  'use cache'

  return 'default'
}

export function nestedNoClosure() {
  return bar()

  async function bar() {
    'use cache'

    return 1234
  }
}

export function nestedWithClosure(name: string) {
  const ref = formatGreeting
  const bound = formatGreeting.bind(null, '!')
  let greeting = `Hello, ${name}`
  greeting += '!'
  return [ref, bound, formatAction]

  async function formatGreeting(suffix: string) {
    'use cache'

    return greeting + suffix
  }

  async function formatAction() {
    'use server'

    return formatGreeting('?')
  }
}

export function blockAndLoopScoped(items: string[], cond: boolean) {
  const results: Array<() => Promise<string>> = []

  if (cond) {
    results.push(inIf)
    const tag = 'if'
    async function inIf() {
      'use cache'

      return tag
    }
  }

  for (let i = 0; i < items.length; i++) {
    results.push(inLoop)
    async function inLoop() {
      'use server'

      return items[i]
    }
  }

  switch (items.length) {
    case 1:
      results.push(inSwitch)
      async function inSwitch() {
        'use cache'

        return 'switch'
      }
      break
  }

  return results
}
