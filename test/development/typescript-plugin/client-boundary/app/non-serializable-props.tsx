'use client'

class Class {}

type ArrowFunctionTypeAlias = () => void

export default function ClientComponent(props: {
  _arrowFunction: () => void
  _arrowFunctionTypeAlias: ArrowFunctionTypeAlias
  _class: Class
  _constructor: new () => void
}) {
  return <p>hello world</p>
}
