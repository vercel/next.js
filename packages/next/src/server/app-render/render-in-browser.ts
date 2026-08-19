import { BailoutToCSRError } from '../../shared/lib/lazy-dynamic/bailout-to-csr'

export function createRenderInBrowserAbortSignal(): AbortSignal {
  const controller = new AbortController()
  controller.abort(new BailoutToCSRError('Render in Browser'))
  return controller.signal
}
