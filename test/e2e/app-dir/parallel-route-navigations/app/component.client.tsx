'use client'

import { useParams } from 'next/navigation'

export default function ComponentClient(props: { file: string }) {
  const params = useParams()
  return (
    <code
      data-client-file={props.file}
      data-client-params={JSON.stringify(params)}
    >
      {JSON.stringify(params)}
    </code>
  )
}
