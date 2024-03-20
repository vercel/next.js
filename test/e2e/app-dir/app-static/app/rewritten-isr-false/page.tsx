import { ShowPathname } from '../pathname-component'

export const revalidate = false

export default function Page() {
  console.log('rendering /rewritten-isr-false')
  return (
    <>
      <p>/rewritten-isr-false</p>
      <ShowPathname />
    </>
  )
}
