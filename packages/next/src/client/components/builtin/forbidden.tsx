import { HTTPAccessErrorFallback } from '../http-access-fallback/error-fallback'

export default function Forbidden() {
  return (
    <HTTPAccessErrorFallback
      status={403}
      message="This page could not be accessed."
    />
  )
}
