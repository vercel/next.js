import {
  unstable_cacheDurable,
  unstable_cacheDurable as durable,
} from 'next/cache'
import * as cache from 'next/cache'

export async function outer(value) {
  async function durableParent() {
    'use cache'
    unstable_cacheDurable()

    const ordinaryChild = async () => {
      'use cache'
      return value
    }

    return ordinaryChild
  }

  async function ordinaryParent() {
    'use cache: remote'

    const durableChild = async () => {
      'use cache: x'
      cache['unstable_cacheDurable']()
      return value
    }

    return durableChild
  }

  const expression = async function named() {
    'use cache: remote'
    durable()
    durable?.()
    return value
  }

  async function action() {
    'use server'
    unstable_cacheDurable()
    return value
  }

  async function shadowed(unstable_cacheDurable, durable, cache) {
    'use cache'
    unstable_cacheDurable()
    durable()
    cache.unstable_cacheDurable()
    return value
  }

  return [durableParent, ordinaryParent, expression, action, shadowed]
}
