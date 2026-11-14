import {
  unstable_cacheDurable,
  unstable_cacheDurable as durable,
} from 'next/cache'
import * as cache from 'next/cache'

unstable_cacheDurable()

export function normal() {
  unstable_cacheDurable()
}

export async function normalAsync() {
  durable()
}

export async function cached() {
  'use cache'

  const callback = () => {
    unstable_cacheDurable()
  }

  return callback()
}

export const expression = async () => unstable_cacheDurable()

export async function nestedAccessors() {
  'use cache'

  return {
    get value() {
      unstable_cacheDurable()
      return 'value'
    },
    set value(value) {
      unstable_cacheDurable()
    },
  }
}

export async function nestedClass() {
  'use cache'

  return class {
    value = unstable_cacheDurable()

    static {
      unstable_cacheDurable()
    }
  }
}

export async function withArguments() {
  'use cache'
  unstable_cacheDurable(sideEffect())
}

export const methods = {
  async cached() {
    'use cache'
    cache.unstable_cacheDurable()
  },
  async action() {
    'use server'
    unstable_cacheDurable()
  },
  normal() {
    durable()
  },
}

export class Methods {
  async cached() {
    'use cache'
    unstable_cacheDurable()
  }

  async action() {
    'use server'
    unstable_cacheDurable()
  }

  normal() {
    cache.unstable_cacheDurable()
  }
}
