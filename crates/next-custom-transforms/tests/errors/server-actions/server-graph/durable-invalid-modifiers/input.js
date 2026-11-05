export async function unknown() {
  'use cache: remote, durable, other'
}

export async function duplicate() {
  'use cache: remote, durable, durable'
}

export async function empty() {
  'use cache: remote, '
}

export async function trailing() {
  'use cache: remote, durable,'
}
