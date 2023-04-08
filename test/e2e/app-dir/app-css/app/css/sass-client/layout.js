'use client'

import './global.scss'
import './global.sass'
import sass from './styles.module.sass'
import scss from './styles.module.scss'

export default function Layout({ children }) {
  return (
    <>
      <div id="sass-client-layout" className={sass.mod}>
        sass client layout
      </div>
      <div id="scss-client-layout" className={scss.mod}>
        scss client layout
      </div>
      {children}
    </>
  )
}
