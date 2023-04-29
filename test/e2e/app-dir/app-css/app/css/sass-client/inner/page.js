'use client'

import './global.scss'
import './global.sass'
import sass from './styles.module.sass'
import scss from './styles.module.scss'

export default function Page() {
  return (
    <>
      <div id="sass-client-page" className={sass.mod}>
        sass client page
      </div>
      <div id="scss-client-page" className={scss.mod}>
        scss client page
      </div>
    </>
  )
}
