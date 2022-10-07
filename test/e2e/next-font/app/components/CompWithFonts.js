import { Inter, Roboto } from '@next/font/google'
const inter = Inter({ variant: '900', display: 'swap', preload: false })
const roboto = Roboto({
  variant: '100-italic',
  display: 'swap',
  preload: true,
})

export default function Component() {
  return (
    <>
      <div id="comp-with-fonts-inter" className={inter.className}>
        {JSON.stringify(inter)}
      </div>
      <div id="comp-with-fonts-roboto" style={roboto.style}>
        {JSON.stringify(roboto)}
      </div>
    </>
  )
}
