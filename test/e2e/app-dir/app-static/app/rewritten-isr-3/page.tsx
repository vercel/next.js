import { ShowPathname } from '../pathname-component'

export const revalidate = 3

export default function Page() {
  console.log('rendering /rewritten-isr-3')
  return (
    <>
      <p>/rewritten-isr-3</p>
      <ShowPathname />
    </>
  )
}
