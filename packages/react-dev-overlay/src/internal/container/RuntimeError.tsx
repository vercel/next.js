import * as React from 'react'
import { noop as css } from '../helpers/noop-template'
import { ReadyRuntimeError } from './Errors'

export type RuntimeErrorProps = { className?: string; error: ReadyRuntimeError }

const RuntimeError: React.FC<RuntimeErrorProps> = function RuntimeError({
  className,
  error,
}) {
  return <div className={className}></div>
}

export const styles = css``

export { RuntimeError }
