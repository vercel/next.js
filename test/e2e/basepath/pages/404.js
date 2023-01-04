import NextError from 'next/error'

export default function Page() {
  return <NextError statusCode={404} />
}
