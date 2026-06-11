// @ts-nocheck
/* eslint-disable */
import { unstable_catchError, type ErrorInfo } from 'next/error'

function CustomErrorBoundary(props, errorInfo: ErrorInfo) {
  return <div>{String(errorInfo.error)}</div>
}

export default unstable_catchError(CustomErrorBoundary)
