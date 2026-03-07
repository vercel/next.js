import { checkBuildFreshness } from './lib/check-build-freshness'

// Load the unhandled rejection filter in the host context.
// This is needed because some unit tests (like fast-set-immediate.external.test.ts)
// need to intercept unhandledRejection events via process.on(). In Jest's VM context,
// process.on() operates on a separate EventEmitter from the real process where
// unhandled rejections fire. The filter patches process.on() to use an internal queue
// that both the host and VM contexts share, making the interception work.
import 'next/dist/server/node-environment-extensions/unhandled-rejection.external'

export default async function globalSetup() {
  await checkBuildFreshness()
}
