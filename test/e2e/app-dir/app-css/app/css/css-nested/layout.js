'use client'

import './style.css'
import styles from './style.module.css'

export default function ClientLayout({ children }) {
  return (
    <>
      <div className={styles['client-css']}>Client Layout: CSS Modules</div>
      <div className="client-css">Client Layout: Global CSS</div>
      {children}
    </>
  )
}
