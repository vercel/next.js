// @ts-nocheck
/* eslint-disable */
import { catchError, type ErrorInfo } from 'next/error'

function CustomErrorBoundary(props, errorInfo: ErrorInfo) {
  return <div>{String(errorInfo.error)}</div>
}

export default catchError(CustomErrorBoundary)
