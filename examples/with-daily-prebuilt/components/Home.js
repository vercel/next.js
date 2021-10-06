import React, { useCallback, useRef, useState } from 'react'
import { CreateRoomButton } from './CreateRoomButton'

export default function Home({ setRoom, setExpiry }) {
  const roomRef = useRef(null)
  const [isValidRoom, setIsValidRoom] = useState(false)

  /**
   * If the room is valid, setIsValidRoom and enable the join button
   */
  const checkValidity = useCallback((e) => {
    if (e?.target?.checkValidity()) {
      setIsValidRoom(true)
    }
  }, [])

  /**
   * Set the roomUrl in local state to trigger Daily iframe creation in <Call />
   */
  const joinCall = useCallback(() => {
    const roomUrl = roomRef?.current?.value
    setRoom(roomUrl)
  }, [roomRef, setRoom])

  return (
    <div>
      <h2>Daily Prebuilt + Next.js</h2>
      <p>Start demo with a new unique room, or paste in your own room URL</p>
      <div className="start-call-container">
        <CreateRoomButton
          isValidRoom={isValidRoom}
          setRoom={setRoom}
          setExpiry={setExpiry}
        />
        <p className="subtext">Or enter room to join</p>
        <label htmlFor="create-room"></label>
        <input
          id="create-room"
          ref={roomRef}
          type="text"
          placeholder="Enter room URL..."
          pattern="^(https:\/\/)?[\w.-]+(\.(daily\.(co)))+[\/\/]+[\w.-]+$"
          onChange={checkValidity}
        />
        <button onClick={joinCall} disabled={!isValidRoom}>
          Join room
        </button>
      </div>
      <style>
        {`
        .start-call-container {
          display: flex;
          flex-direction: column;
          max-width: 200px;
          margin: auto;
        }
        .start-call-container .subtext {
          font-size: 12px; 
          margin: 16px; 
        }
        .start-call-container input {
          height: 32px;
          border-radius: 8px;
          border: 1px solid var(--grey);
          padding: 0 16px;
        }
        .start-call-container button {
          color: var(--dark-blue);
          background: var(--teal);
          border: 1px solid transparent;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 12px;
          line-height: 16px;
          font-weight: bold;
          cursor: pointer;
          margin-top: 16px;
        }
        .start-call-container button:disabled {
          cursor: not-allowed;
          background: var(--white);
          border: 1px solid var(--grey);
        }
        label {
          opacity: 0;
          font-size: 1px;
        }
      `}
      </style>
    </div>
  )
}
