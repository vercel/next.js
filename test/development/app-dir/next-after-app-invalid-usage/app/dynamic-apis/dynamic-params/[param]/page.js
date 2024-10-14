import { unstable_after as after } from 'next/server'

export default function Page({ params }) {
  after(async () => {
    await params
  })
  return null
}
