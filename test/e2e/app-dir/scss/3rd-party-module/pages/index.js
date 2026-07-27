import { foo } from './index.module.scss'

export default function Home() {
  return (
    <div id="verify-div" className={foo}>
      <div className="bar">Bar</div>
      <div className="baz">Baz</div>
      <div className="lol">Lol</div>
      <div className="lel">Lel</div>
    </div>
  )
}
