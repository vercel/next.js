import { handleClientError } from '../react-dev-overlay/internal/helpers/use-error-handler'
import { patchConsoleError } from './intercept-console-error'

patchConsoleError(handleClientError)
