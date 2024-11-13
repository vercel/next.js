import { HTTPAccessErrorFallback } from './error-fallback'

export default function NotFound() {
  return (
    <HTTPAccessErrorFallback
      status={401}
      message="This page is not authorized"
    />
  )
}
