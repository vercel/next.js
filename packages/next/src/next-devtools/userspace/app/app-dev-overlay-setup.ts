import { patchConsoleError } from './errors/intercept-console-error'
import { handleGlobalErrors } from './errors/use-error-handler'

handleGlobalErrors()
patchConsoleError()
