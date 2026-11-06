import { unstable_cacheDurable } from 'next/cache'
import { readEnv } from '../dependencies/read'
import { hasEnv } from '../dependencies/existence'
import { stable, unrelatedUnstable } from '../dependencies/mixed-exports'
import { moduleDurable } from '../dependencies/module-durable'

async function ordinaryRemote() {
  'use cache: remote'
  return [
    process.env.UNSTABLE_DURABLE_TEST,
    process.env.UNSTABLE_DURABLE_TEST ? 'present' : 'absent',
    readEnv(),
    hasEnv(),
    // Keep the unstable sibling export reachable, but outside durable().
    unrelatedUnstable(),
  ]
}

async function nestedRemote() {
  'use cache: remote'
  return ordinaryRemote()
}

async function durable() {
  'use cache: remote'
  unstable_cacheDurable()
  return [
    process.env.STABLE_DURABLE_TEST,
    process.env.STABLE_DURABLE_TEST ? 'present' : 'absent',
    // Analysis must follow this named export, not its entire module.
    stable(),
  ]
}

export async function getValue() {
  return [
    await ordinaryRemote(),
    await nestedRemote(),
    await durable(),
    await moduleDurable(),
  ]
}
