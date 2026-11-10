import shared1 from '../shared1.module.css'
import uniqueA from '../uniqueA.module.css'
import shared2 from '../shared2.module.css'
import Nav from '../../nav'

export default function Page() {
  return (
    <div>
      <p
        className={`${shared1.name} ${uniqueA.name} ${shared2.name}`}
        id="hellosba"
      >
        hello world
      </p>
      <Nav />
    </div>
  )
}
