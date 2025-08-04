import { patchConsoleError } from './errors/intercept-console-error'
import { handleGlobalErrors } from './errors/use-error-handler'
import {
  initializeDebugLogForwarding,
  isTerminalLoggingEnabled,
} from './forward-logs'

handleGlobalErrors()
patchConsoleError()

if (isTerminalLoggingEnabled) {
  initializeDebugLogForwarding('app')
}
