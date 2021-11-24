import { urlForImage } from '../lib/sanity'

export default function Avatar({ name, picture }) {
  return (
    <div className="flex items-center">
      <img
        src={urlForImage(picture).height(96).width(96).fit('crop').url()}
        className="w-12 h-12 rounded-full mr-4"
        alt={name}
      />
      <div className="text-xl font-bold">{name}</div>
    </div>
  )
}
