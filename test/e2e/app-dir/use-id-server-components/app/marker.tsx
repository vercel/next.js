import { useId } from 'react'

/**
 * A Server Component that mints an id with `useId()` and prints it, so a
 * collision between two independently rendered Flight payloads is observable
 * from the DOM.
 */
export function Marker({ name }: { name: string }) {
  const id = useId()
  return (
    <span data-marker={name} data-marker-id={id}>
      {name}: {id}
    </span>
  )
}
