import { redText } from './index.module.scss'

function Home() {
  return (
    <>
      <div id="verify-red" className={redText}>
        This text should be red.
      </div>
      <br />
      <input key={'' + Math.random()} id="text-input" type="text" />
    </>
  )
}

export default Home
