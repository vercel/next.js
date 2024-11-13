import { HTTPAccessErrorFallback } from './http-access-fallback/error-fallback'

export default function NotFound() {
  return (
    <HTTPAccessErrorFallback
      status={401}
      message="This page is not authorized"
    />
  )
}
