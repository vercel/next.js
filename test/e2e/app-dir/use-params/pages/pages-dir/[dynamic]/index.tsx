import { useParams } from 'next/navigation'
export default function Page() {
  const params = useParams()

  return (
    <div>
      <div id="params">{JSON.stringify(params?.dynamic)}</div>
    </div>
  )
}
