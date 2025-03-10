'use client'

function throwError() {
  throw new Error('Boom')
}

export function Thrower() {
  throwError()
}
