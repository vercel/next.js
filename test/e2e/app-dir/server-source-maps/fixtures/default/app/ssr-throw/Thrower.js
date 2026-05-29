'use client'

function throwError() {
  throw new Error('ssr-throw')
}

export function Thrower() {
  throwError()
}
