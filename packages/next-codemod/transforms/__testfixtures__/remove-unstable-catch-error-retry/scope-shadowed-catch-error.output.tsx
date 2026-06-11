// @ts-nocheck
/* eslint-disable */
import { catchError } from 'next/error'

function outer() {
  const unstable_catchError = () => 'local'
  return unstable_catchError()
}

export default catchError(Component)
