'use client'

class Class {}

type ArrowFunctionTypeAlias = () => void

export default function ClientComponent(props: {
  _functionAction(): void
  _arrowFunctionAction: () => void
  _arrowFunctionTypeAliasAction: ArrowFunctionTypeAlias
  _arrowFunctionConditionalAction: (() => void) | null
  // Doesn't make sense, but check for loophole
  _classAction: Class
  _constructorAction: new () => void
}) {
  return <p>hello world</p>
}
