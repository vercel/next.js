'use client'

function useThrowError() {
  if (typeof window !== 'undefined') {
    Promise.reject('string in rejected promise')
  }
}

function useErrorHook() {
  useThrowError()
}

export default function Page() {
  useErrorHook()
  return <p>hello world</p>
}
