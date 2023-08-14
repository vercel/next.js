'use client'

import styles from './button.module.css'
import React from 'react'

export const Button = ({ children, ...props }) => {
  return (
    <button {...props} className={styles.button}>
      {children}
    </button>
  )
}
