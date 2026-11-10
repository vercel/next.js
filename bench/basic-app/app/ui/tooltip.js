'use client'
import { useState } from 'react'
export default function Tooltip({ text, children }) {
  const [show, setShow] = useState(false)
  return (
    <span
      className="tooltip-wrap"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      {show ? (
        <span role="tooltip" className="tooltip">
          {text}
        </span>
      ) : null}
    </span>
  )
}
