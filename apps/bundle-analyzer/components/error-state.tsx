'use client'

import { RefreshCw, AlertTriangle } from 'lucide-react'
import { NetworkError } from '@/lib/errors'

interface ErrorStateProps {
  error: unknown
  onRetry?: () => void
}

export function ErrorState({ error }: ErrorStateProps) {
  const isNetwork = error instanceof NetworkError
  const title = isNetwork ? 'Server Connection Lost' : 'Error'
  const message = isNetwork
    ? 'Unable to connect to the bundle analyzer server. Please ensure the server is running and try again.'
    : ((error as any)?.message ?? 'An unexpected error occurred.')

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-4 max-w-md px-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10 text-destructive mb-2">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {title}
          </h3>
          <p className="text-sm text-muted-foreground mb-4">{message}</p>
          <button
            onClick={() => {
              window.location.reload()
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium"
          >
            <RefreshCw className="w-4 h-4" />
            Retry Connection
          </button>
        </div>
      </div>
    </div>
  )
}
