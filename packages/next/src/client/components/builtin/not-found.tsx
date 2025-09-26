import { HTTPAccessErrorFallback } from '../http-access-fallback/error-fallback'

export default function NotFound() {
  return (
    <HTTPAccessErrorFallback
      status={404}
      message="This page could not be found."
    />
  )
}
