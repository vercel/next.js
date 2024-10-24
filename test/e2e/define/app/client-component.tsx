'use client'

declare const MY_MAGIC_VARIABLE: string

export function ClientValue() {
  return (
    <>{typeof MY_MAGIC_VARIABLE === 'string' ? MY_MAGIC_VARIABLE : 'not set'}</>
  )
}
