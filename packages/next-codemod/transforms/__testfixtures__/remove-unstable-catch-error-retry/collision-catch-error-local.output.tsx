// @ts-nocheck
/* eslint-disable */
import { catchError as unstable_catchError } from 'next/error'

// A pre-existing local `catchError` must keep working after the migration.
function catchError() {
  return 'local'
}

export default unstable_catchError(catchError())
