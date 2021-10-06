import React, { useState } from 'react'

export function CreateRoomButton({ isValidRoom, setRoom, setExpiry }) {
  const [isError, setIsError] = useState(false)

  /**
   * Send a request to create a Daily room server-side via Next API routes, then set the returned url in local state to trigger Daily iframe creation in <Call />
   */
  const createRoom = async () => {
    try {
      const res = await fetch('/api/room', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      const resJson = await res.json()
      setExpiry(resJson.config?.exp)
      setRoom(resJson.url)
    } catch (e) {
      setIsError(true)
    }
  }
  return (
    <>
      {isError && <p className="error">Room could not be created</p>}
      <button onClick={createRoom} disabled={isValidRoom}>
        Create room and start
      </button>
      <style jsx>{`
        .error {
          color: var(--red-dark);
        }
      `}</style>
    </>
  )
}
