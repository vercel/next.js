import Comp from './Comp'
import { font1, font2 } from '../../fonts'

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

export const runtime = 'experimental-edge'
