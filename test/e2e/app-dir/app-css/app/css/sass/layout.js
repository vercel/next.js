import './global.scss'
import './global.sass'
import sass from './styles.module.sass'
import scss from './styles.module.scss'

export default function Layout({ children }) {
  return (
    <>
      <div id="sass-server-layout" className={sass.mod}>
        sass server layout
      </div>
      <div id="scss-server-layout" className={scss.mod}>
        scss server layout
      </div>
      {children}
    </>
  )
}
