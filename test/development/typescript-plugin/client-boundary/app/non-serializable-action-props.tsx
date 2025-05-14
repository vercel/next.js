'use client'

class Class {}

export default function ClientComponent({
  _functionAction,
  _arrowFunctionAction,
  // Doesn't make sense, but check for loophole
  _classAction,
  _constructorAction,
}: {
  _functionAction: () => void
  _arrowFunctionAction: () => void
  // Doesn't make sense, but check for loophole
  _classAction: Class
  _constructorAction: new () => void
}) {
  return <p>hello world</p>
}
