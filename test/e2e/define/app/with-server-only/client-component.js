/* eslint-disable no-undef */
'use client'

import { useState, useEffect } from 'react'

export function ClientValue() {
  const [serverVar, setServerVar] = useState('<loading>')
  // Use `useEffect` to only evaluate this in the actual browser as client
  // components are still SSRed
  useEffect(() => {
    setServerVar(
      typeof MY_SERVER_VARIABLE === 'string' ? MY_SERVER_VARIABLE : 'not set'
    )
  }, [setServerVar])

  return <>{serverVar}</>
}

export function ClientExpr() {
  const [serverExpr, setServerExpr] = useState('<loading>')
  useEffect(() => {
    setServerExpr(
      typeof process.env.MY_MAGIC_SERVER_EXPR === 'string'
        ? process.env.MY_MAGIC_SERVER_EXPR
        : 'not set'
    )
  }, [setServerExpr])

  return <>{serverExpr}</>
}
