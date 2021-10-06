import React, { useEffect, useState } from 'react'

export const ExpiryTimer = ({ expiry }) => {
  const [secs, setSecs] = useState('--:--')

  // If room has an expiry time, we'll calculate how many seconds until expiry
  useEffect(() => {
    if (!expiry) {
      return false
    }
    const i = setInterval(() => {
      const timeLeft = Math.round(expiry - Date.now() / 1000)
      if (timeLeft < 0) {
        return setSecs(null)
      }
      setSecs(`${Math.floor(timeLeft / 60)}:${`0${timeLeft % 60}`.slice(-2)}`)
    }, 1000)

    return () => clearInterval(i)
  }, [expiry])

  if (!secs) {
    return null
  }

  return (
    <div className="countdown">
      {secs}
      <style jsx>{`
        .countdown {
          font-size: 14px;
          margin-left: 8px;
        }
      `}</style>
    </div>
  )
}

export default ExpiryTimer
