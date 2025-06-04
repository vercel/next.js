'use client'

function useThrowError() {
  throw new Error('ssr error')
}

function useErrorHook() {
  useThrowError()
}

export default function Page() {
  useErrorHook()
  return <p>hello world</p>
}
