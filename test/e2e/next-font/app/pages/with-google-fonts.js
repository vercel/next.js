import { Fraunces, Indie_Flower } from '@next/font/google'

const indieFlower = Indie_Flower({ weight: '400' })
const fraunces = Fraunces({ weight: '400' })

export default function WithFonts() {
  return (
    <>
      <div id="first-google-font" className={indieFlower.className}>
        {JSON.stringify(indieFlower)}
      </div>
      <div id="second-google-font" className={fraunces.className}>
        {JSON.stringify(fraunces)}
      </div>
    </>
  )
}
