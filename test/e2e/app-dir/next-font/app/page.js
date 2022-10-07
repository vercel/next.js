import Comp from './Comp'
import font2 from '../fonts/font2'

export default function HomePage() {
  return (
    <>
      <p id="root-page" className={font2.className}>
        {JSON.stringify(font2)}
      </p>
      <Comp />
    </>
  )
}
