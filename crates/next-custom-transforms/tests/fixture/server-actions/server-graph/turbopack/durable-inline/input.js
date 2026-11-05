export async function outer(value) {
  const arrow = async () => {
    'use cache:   x  ,   durable  '
    return value
  }

  async function remote() {
    'use cache: remote, durable'
    return value
  }

  const expression = async function named() {
    'use cache: remote ,durable'
    return value
  }

  async function ordinary() {
    'use cache: remote'
    return value
  }

  async function action() {
    'use server'
    return value
  }

  return [arrow, remote, expression, ordinary, action]
}
