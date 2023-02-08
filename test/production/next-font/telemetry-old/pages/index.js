import { Open_Sans } from '@next/font/google'
const openSans = Open_Sans({ subsets: ['latin'] })

export default function Page() {
  return (
    <>
      <p>Hello world 1</p>
      <p className={openSans.className}>Hello world 2</p>
    </>
  )
}
