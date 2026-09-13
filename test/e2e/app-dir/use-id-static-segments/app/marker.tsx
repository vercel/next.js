import { useId } from 'react'

export function Marker({ name }: { name: string }) {
  const id = useId()
  return (
    <span data-marker={name} data-marker-id={id}>
      {name}: {id}
    </span>
  )
}
