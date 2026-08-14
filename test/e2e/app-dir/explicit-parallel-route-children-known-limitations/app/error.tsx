'use client'

export default function Error({ error }: { error: Error }) {
  return <p id="root-error">Root error: {error.message}</p>
}
