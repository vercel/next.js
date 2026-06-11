// @ts-nocheck
/* eslint-disable */
import { unstable_catchError } from 'next/error'

function outer() {
  const unstable_catchError = () => 'local'
  return unstable_catchError()
}

export default unstable_catchError(Component)
