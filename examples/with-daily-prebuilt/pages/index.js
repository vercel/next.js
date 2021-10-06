import React, { useState } from 'react'
import Call from '/components/Call'
import Home from '/components/Home'
import Header from '/components/Header'

export default function Index({}) {
  const [room, setRoom] = useState(null)
  const [expiry, setExpiry] = useState(null)
  const [callFrame, setCallFrame] = useState(null)

  return (
    <div className="app">
      <Header />
      <main className="app-wrapper">
        {room ? (
          <Call
            room={room}
            expiry={expiry}
            setRoom={setRoom}
            setCallFrame={setCallFrame}
            callFrame={callFrame}
          />
        ) : (
          <Home setRoom={setRoom} setExpiry={setExpiry} />
        )}
      </main>
      <style jsx global>{`
        html {
          --grey-lightest: #f7f9fa;
          --white: #ffffff;
          --grey: #c8d1dc;
          --dark-grey: #6b7785;
          --dark-blue: #1f2d3d;
          --dark-blue-border: #2b3f56;
          --teal: #1bebb9;
          --red-dark: #bb0c0c;
          --font-family: GraphikRegular, 'Helvetica Neue', Sans-Serif;
        }
        body {
          margin: 0;
          min-height: 100vh;
        }
        .app {
          font-family: Helvetica, Arial, sans-serif;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          text-align: center;
          color: #2c3e50;
          height: 100vh;
          overflow: scroll;
          display: flex;
          flex-direction: column;
          background-color: var(--grey-lightest);
        }
        .app-wrapper {
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        :global(.row) {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
      `}</style>
    </div>
  )
}
