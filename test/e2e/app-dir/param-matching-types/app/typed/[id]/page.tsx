import type { ParamMatching } from 'next'

export async function experimental_generateParamMatching(): Promise<
  ParamMatching<'id'>
> {
  return { id: 'blocking' }
}

export function generateStaticParams() {
  return [{ id: 'one' }]
}

export default function Page() {
  return <p>Optionally annotated configuration</p>
}
