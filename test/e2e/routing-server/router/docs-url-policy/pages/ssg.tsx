import type { InferGetStaticPropsType } from 'next'

export function getStaticProps() {
  return { props: { marker: 'SSG destination' } }
}

export default function Page({
  marker,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  return <p id="destination">{marker}</p>
}
