import baseStyle from '../base2.module.css'
import baseStyle2 from '../base2-scss.module.scss'
import style from './style.module.css'
import Nav from '../nav'

export default function Page() {
  return (
    <div>
      <p
        className={`${style.name} ${baseStyle.base} ${baseStyle2.base}`}
        id="hello1"
      >
        hello world
      </p>
      <Nav />
    </div>
  )
}
