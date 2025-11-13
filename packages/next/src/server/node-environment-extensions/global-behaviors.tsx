/**
 * Unlike most files in the node-environment-extensions folder this one is not
 * an extension itself but it exposes a function to install config based global
 * behaviors that should be loaded whenever a Node Server or Node Worker are created.
 */
import type { NextConfigComplete } from '../config-shared'
import { InvariantError } from '../../shared/lib/invariant-error'

import { setAbortedLogsStyle } from './console-dim.external'

export function installGlobalBehaviors(config: NextConfigComplete) {
  if (process.env.NEXT_RUNTIME === 'edge') {
    throw new InvariantError(
      'Expected not to install Node.js global behaviors in the edge runtime.'
    )
  }

  if (config.experimental?.hideLogsAfterAbort === true) {
    setAbortedLogsStyle('hidden')
  } else {
    setAbortedLogsStyle('dimmed')
  }
}
