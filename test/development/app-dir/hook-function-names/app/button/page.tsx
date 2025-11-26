'use client'

import { useCallback } from 'react'

const Button = ({ message }: { message: string }) => {
  const handleClick = useCallback(() => {
    throw new Error(message)
  }, [message])

  return (
    <button type="button" onClick={handleClick}>
      Click me
    </button>
  )
}

export default function Page() {
  return <Button message="Kaputt!" />
}
