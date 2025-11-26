'use client'

export default function ClientComponent(props: {
  _string: string
  _number: number
  _boolean: boolean
  _array: string[]
  _object: { some: string }
  _null: null
  _undefined: undefined
}) {
  return <p>hello world</p>
}
