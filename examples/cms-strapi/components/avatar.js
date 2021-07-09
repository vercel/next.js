import Image from 'next/image'
import { getStrapiMedia } from '../lib/media'

export default function Avatar({ name, picture }) {
  const fullUrl = getStrapiMedia(picture)

  return (
    <div className="flex items-center ">
      <Image
        src={fullUrl}
        layout="fixed"
        width={48}
        height={48}
        alt={name}
        className="rounded-full grayscale"
      />
      <div className="text-xl font-bold ml-4">{name}</div>
    </div>
  )
}
