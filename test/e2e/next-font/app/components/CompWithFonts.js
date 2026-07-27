import { Inter, Roboto } from 'next/font/google'
const inter = Inter({
  weight: '900',
  display: 'swap',
  preload: false,
  subsets: ['latin'],
})
const roboto = Roboto({
  weight: '100',
  style: 'italic',
  display: 'swap',
  preload: true,
  subsets: ['vietnamese'],
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
