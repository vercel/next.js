'use client'
import { describeAuthLayer } from './vendor-auth'
import { useState } from 'react'
export default function AlertBanner({
  severity,
  title,
  body,
  action,
  dismissible,
}) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null
  return (
    <div className={'alert alert-' + severity} role="status">
      <div className="alert-text">
        <strong>{title}</strong>
        <span>{body}</span>
      </div>
      {action ? (
        <button type="button" className="alert-action">
          {action}
        </button>
      ) : null}
      {dismissible ? (
        <button
          type="button"
          className="alert-dismiss"
          aria-label="Dismiss"
          onClick={() => setDismissed(true)}
        >
          ×
        </button>
      ) : null}
    </div>
  )
}

export const __layers = [describeAuthLayer].length
