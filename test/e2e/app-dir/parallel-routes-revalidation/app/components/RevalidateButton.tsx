'use client'
import { revalidateAction } from '../nested-revalidate/@modal/modal/action'

export function RevalidateButton({ id }: { id?: string }) {
  return (
    <button
      id={`revalidate-button${id ? `-${id}` : ''}`}
      style={{ color: 'orange', padding: '10px' }}
      onClick={() => revalidateAction()}
    >
      Revalidate
    </button>
  )
}
