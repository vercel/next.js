'use client'

class MyClass {}

export function ClientComponent({
  unknownAction,
  //^^^^^^^^^^^ fine because it looks like an action
  unknown,
  //^^^^^ "Error(TS71007): Props must be serializable for components in the "use client" entry file. "unknown" is a function that's not a Server Action. Rename "unknown" either to "action" or have its name end with "Action" e.g. "unknownAction" to indicate it is a Server Action. ts(71007)
  foo,
  //^ "Error(TS71007): Props must be serializable for components in the "use client" entry file, "foo" is invalid.ts(71007)
  bar,
  //^ "Error(TS71007): Props must be serializable for components in the "use client" entry file, "bar" is invalid.ts(71007)
}: {
  unknownAction: () => void
  unknown: () => void
  foo: new () => Error
  bar: MyClass
}) {
  console.log({ unknown, unknownAction, foo, bar })
  return null
}
