import * as React from 'react'
import { StackFrame } from '../StackFrame'

export type RuntimeErrorObject = {
  eventId: string
  error: Error
  frames: StackFrame[]
}
export type RuntimeErrorsProps = { errors: RuntimeErrorObject[] }

export const RuntimeErrors: React.FC<RuntimeErrorsProps> = function RuntimeErrors({
  errors,
}) {
  console.log('Runtime errors:', errors)
  return <div />
}
