import * as React from 'react'
import { UnhandledError, UnhandledRejection } from '../bus'

export type SupportedErrorEvents = UnhandledError | UnhandledRejection
export type ErrorsProps = {
  errors: SupportedErrorEvents[]
}

export const Errors: React.FC<ErrorsProps> = function Errors() {
  return null
}
