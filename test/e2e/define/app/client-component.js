/* eslint-disable no-undef */
'use client'

export function ClientValue() {
  return (
    <>{typeof MY_MAGIC_VARIABLE === 'string' ? MY_MAGIC_VARIABLE : 'not set'}</>
  )
}

export function ClientExpr() {
  return (
    <>
      {typeof process.env.MY_MAGIC_EXPR === 'string'
        ? process.env.MY_MAGIC_EXPR
        : 'not set'}
    </>
  )
}
