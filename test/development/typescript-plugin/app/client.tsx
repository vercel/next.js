'use client'

export function ClientComponent({
  unknownAction,
  //^^^^^^^^^^^ fine because it looks like an action
  unknown,
  //^^^^^ "Error(TS71007): Props must be serializable for components in the "use client" entry file. "unknown" is a function that's not a Server Action. Rename "unknown" either to "action" or have its name end with "Action" e.g. "unknownAction" to indicate it is a Server Action.ts(71007)
}: {
  unknownAction: () => void
  unknown: () => void
}) {
  console.log({ unknown, unknownAction })
  return null
}
