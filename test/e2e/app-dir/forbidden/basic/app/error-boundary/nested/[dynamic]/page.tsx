import { forbidden } from 'next/navigation'

export default function Page({ params }) {
  if (params.dynamic === 'trigger-forbidden') {
    forbidden()
  }

  return <div>Hello World</div>
}
