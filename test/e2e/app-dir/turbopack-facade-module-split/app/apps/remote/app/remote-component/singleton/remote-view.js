'use client'

import { singleton } from 'demo-pkg'

export const REMOTE_CONSUMER_MODULE = 'remote-consumer-module-marker'

// The remote consumer's view of the singleton, as export-bound getters so the
// values stay live and are read from whichever demo-pkg instance the scope
// require resolves for this module. Intentionally React-free: the sharing
// layer executes this module in its own scope.
export const remoteView = {
  get instanceId() {
    return singleton.instanceId
  },
  get marker() {
    return singleton.marker
  },
}
