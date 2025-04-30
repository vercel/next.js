import { HTTPAccessErrorFallback } from './http-access-fallback/error-fallback'

export default function Gone() {
  return (
    <HTTPAccessErrorFallback
      status={410}
      message="This page has been permanently removed."
    />
  )
}
