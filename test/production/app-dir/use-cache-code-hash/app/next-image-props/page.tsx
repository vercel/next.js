import { getImageProps } from 'next/image'

async function logic() {
  'use cache'

  return getImageProps({
    src: '/vercel.svg',
    alt: 'Vercel Logo',
    width: 72,
    height: 16,
  }).props.src
}

export default async function Page() {
  return <p>{await logic()}</p>
}
