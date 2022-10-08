'client'
import Comp from './Comp'
import font5 from '../../fonts/font5'

export default function HomePage() {
  return (
    <>
      <p id="client-page" className={font5.className}>
        {JSON.stringify(font5)}
      </p>
      <Comp />
    </>
  )
}
