import { Suspense } from 'react'
import ComponentClient from './component.client'

type Props = {
  file: string
  params: Promise<Record<string, string | string[]>>
}

async function ComponentServer(props: Props) {
  const params = await props.params
  return (
    <code
      data-server-file={props.file}
      data-server-params={JSON.stringify(params)}
    >
      {JSON.stringify(params)}
    </code>
  )
}

export default function Component(props: Props) {
  return (
    <div data-file={props.file}>
      <div>File: {props.file}</div>

      <Suspense fallback={<div data-loading>Loading Server...</div>}>
        <ComponentServer {...props} />
      </Suspense>
      <Suspense fallback={<div data-loading>Loading Client...</div>}>
        <ComponentClient file={props.file} />
      </Suspense>
    </div>
  )
}
