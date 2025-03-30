import { HTTPAccessErrorFallback } from './http-access-fallback/error-fallback'

export default function Unauthorized() {
  return (
    <HTTPAccessErrorFallback
      status={401}
      message="You're not authorized to access this page."
    />
  )
}
