'use strict'

export const runServer = inlineAction
export const runDefault = defaultCached

async function inlineAction(value) {
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

export function nestedWithClosure(name) {
  const greeting = `Hello, ${name}!`
  const ref = formatGreeting
  const bound = formatGreeting.bind(null, '!')
  return [ref, bound, formatAction]

  async function formatGreeting(suffix) {
    'use cache'

    return greeting + suffix
  }

  async function formatAction() {
    'use server'

    return formatGreeting('?')
  }
}

export function blockAndLoopScoped(items, cond) {
  const results = []

  if (cond) {
    const tag = 'if'
    results.push(inIf)
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
