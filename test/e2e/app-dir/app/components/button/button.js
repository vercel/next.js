'use client'
import * as buttonStyle from './button.module.css'

export function Button({ children }) {
  return (
    <button
      className={buttonStyle.button}
      onClick={() => {
        console.log('clicked button!')
      }}
    >
      {children}
    </button>
  )
}
