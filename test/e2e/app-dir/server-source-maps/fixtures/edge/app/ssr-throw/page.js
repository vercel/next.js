'use client'

function throwError() {
  throw new Error('ssr-throw')
}

export default function Page() {
  throwError()
  return null
}
