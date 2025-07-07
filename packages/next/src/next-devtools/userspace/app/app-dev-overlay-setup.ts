import { patchConsoleError } from './errors/intercept-console-error'
import { handleGlobalErrors } from './errors/use-error-handler'
import { initializeDebugLogForwarding } from './forward-logs'
import { isTerminalLoggingEnabled } from './terminal-logging-config'

handleGlobalErrors()
patchConsoleError()

if (isTerminalLoggingEnabled()) {
  initializeDebugLogForwarding('app')
}
