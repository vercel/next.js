import { connection } from 'next/server'
import { useId } from 'react'
import { nextRenderId } from './render-id'

export function Marker({ name }: { name: string }) {
  const id = useId()
  return (
    <span data-marker={name} data-marker-id={id} data-render={nextRenderId()}>
      {name}: {id}
    </span>
  )
}

/**
 * Mints its id in the dynamic part of the render, which is what a segment that
 * reads cookies() or headers() does.
 */
export async function DynamicMarker({ name }: { name: string }) {
  await connection()
  return <Marker name={name} />
}
