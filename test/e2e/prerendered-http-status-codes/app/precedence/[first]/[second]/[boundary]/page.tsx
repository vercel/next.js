import { HTTPErrorPair } from '../../../http-error'

export function generateStaticParams() {
  const errors = [
    'not-found',
    'unauthorized',
    'forbidden',
    'redirect',
    'permanent-redirect',
  ]
  return errors.flatMap((first) =>
    errors.flatMap((second) =>
      ['suspense', 'root'].map((boundary) => ({ first, second, boundary }))
    )
  )
}

export default async function Page({
  params,
}: {
  params: Promise<{
    first: string
    second: string
    boundary: string
  }>
}) {
  const { first, second, boundary } = await params
  return <HTTPErrorPair first={first} second={second} boundary={boundary} />
}
