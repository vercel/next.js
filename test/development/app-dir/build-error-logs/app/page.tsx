import { data } from '@/lib/data'

export default function Page() {
  return (
    <>
      <h1>{data.title}</h1>
      <p>{data.content}</p>
    </>
  )
}
