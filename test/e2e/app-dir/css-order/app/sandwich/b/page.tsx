import shared1 from '../shared1.module.css'
import '../uniqueB.css'
import shared2 from '../shared2.module.css'
import Nav from '../../nav'

export default function Page() {
  return (
    <div>
      <p
        className={`${shared1.name} sandwich-b-marker ${shared2.name}`}
        id="hellosbb"
      >
        hello world
      </p>
      <Nav />
    </div>
  )
}
