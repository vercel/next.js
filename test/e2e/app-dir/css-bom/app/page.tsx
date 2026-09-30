import first from './first.module.scss'
import second from './second.module.scss'
import third from './third.module.scss'

export default function Page() {
  return (
    <>
      <p className="bom">hello world</p>
      <p id="sass-first" className={first.rule}>
        First Sass module
      </p>
      <p id="sass-second" className={second.rule}>
        Second Sass module
      </p>
      <p id="sass-third" className={third.rule}>
        Third Sass module
      </p>
    </>
  )
}
