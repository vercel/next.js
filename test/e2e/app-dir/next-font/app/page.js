import Comp from './Comp'
import font1 from '../fonts/font1'
import font2 from '../fonts/font2'

export default function HomePage() {
  return (
    <>
      <p className={font1.className}>Hello world</p>
      <p id="root-page" className={font2.className}>
        {JSON.stringify(font2)}
      </p>
      <Comp />
    </>
  )
}

export const config = { runtime: 'experimental-edge' }
