import { setTimeout } from 'timers/promises'

export default async function Page() {
  await helper()
  return null
}

async function helper() {
  await now(async () => {
    await setTimeout(500)
    await nestedHelper()
  })
}

async function nestedHelper() {
  await now(async () => {
    await setTimeout(500)
    throws()
  })
}

function throws() {
  throw new Error('kaboom')
}

async function now(cb) {
  await cb()
}

// throws

// <anonymous> (at nestedHelper)
// now
// nestedHelper

// <anonymous> (at helper)
// now
// helper

// Page
