import { useId } from 'react'
import { nextRenderId } from './render-id'

/**
 * A Server Component that mints an id with `useId()` and exposes it, so a
 * collision between two independently rendered Flight payloads is observable
 * from the DOM.
 */
export function Marker({ name }: { name: string }) {
  const id = useId()
  return (
    <span data-marker={name} data-marker-id={id} data-render={nextRenderId()}>
      {name}: {id}
    </span>
  )
}
