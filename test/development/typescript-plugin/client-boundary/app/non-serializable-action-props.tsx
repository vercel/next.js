'use client'

class Class {}

type ArrowFunctionTypeAlias = () => void

export default function ClientComponent({
  _arrowFunctionAction,
  _arrowFunctionTypeAliasAction,
  // Doesn't make sense, but check for loophole
  _classAction,
  _constructorAction,
}: {
  _arrowFunctionAction: () => void
  _arrowFunctionTypeAliasAction: ArrowFunctionTypeAlias
  // Doesn't make sense, but check for loophole
  _classAction: Class
  _constructorAction: new () => void
}) {
  return <p>hello world</p>
}
