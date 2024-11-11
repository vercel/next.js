/* eslint-disable no-undef */
'use client'

export function ClientValue() {
  return (
    <>{typeof MY_MAGIC_VARIABLE === 'string' ? MY_MAGIC_VARIABLE : 'not set'}</>
  )
}
