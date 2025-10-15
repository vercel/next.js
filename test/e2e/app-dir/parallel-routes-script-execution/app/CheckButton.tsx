"use client"

import { useState } from "react"

export default function CheckButton() {
  const [value, setValue] = useState("")

  function handlePress() {
    setValue(
      (window as any)[Symbol.for("react-aria.i18n.locale")] ?? "undefined"
    )
  }

  return (
    <div>
      <button data-testid="check-button" onClick={handlePress}>
        Check
      </button>
      {value && (
        <p data-testid="locale-result">
          window[Symbol.for('react-aria.i18n.locale')] is {value}
        </p>
      )}
    </div>
  )
}
