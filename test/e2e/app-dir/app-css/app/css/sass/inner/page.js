import './global.scss'
import './global.sass'
import sass from './styles.module.sass'
import scss from './styles.module.scss'

export default function Page() {
  return (
    <>
      <div id="sass-server-page" className={sass.mod}>
        sass server page
      </div>
      <div id="scss-server-page" className={scss.mod}>
        scss server page
      </div>
    </>
  )
}
