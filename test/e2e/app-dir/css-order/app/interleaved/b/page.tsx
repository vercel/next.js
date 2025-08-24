import style0 from '../style0.module.css'
import style1 from '../style1.module.css'
import style3 from '../style3.module.css'
import style4 from '../style4.module.css'
import Nav from '../../nav'

export default function Page() {
  return (
    <div>
      <p
        className={`${style0.name} ${style1.name} ${style3.name} ${style4.name}`}
        id="helloib"
      >
        hello world
      </p>
      <Nav />
    </div>
  )
}
