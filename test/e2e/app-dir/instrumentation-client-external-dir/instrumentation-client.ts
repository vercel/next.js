import { initClient } from '../external-package/utils'

const result = initClient({ debug: true })
;(window as any).__INSTRUMENTATION_CLIENT_RESULT = result
