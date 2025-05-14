'use client'

class Class {}

type ArrowFunctionTypeAlias = () => void

export default function ClientComponent({
  _arrowFunction,
  _arrowFunctionTypeAlias,
  _class,
  _constructor,
}: {
  _arrowFunction: () => void
  _arrowFunctionTypeAlias: ArrowFunctionTypeAlias
  _class: Class
  _constructor: new () => void
}) {
  return <p>hello world</p>
}
