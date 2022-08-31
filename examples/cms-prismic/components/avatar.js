import { PrismicNextImage } from '@prismicio/next'

/**
 * @param {object} props
 * @param {string} props.name
 * @param {import("@prismicio/types").ImageField} props.picture
 */
export default function Avatar({ name, picture }) {
  return (
    <div className="flex items-center">
      <div className="w-12 h-12 relative mr-4">
        <PrismicNextImage
          field={picture}
          layout="fill"
          className="rounded-full"
        />
      </div>
      <div className="text-xl font-bold">{name}</div>
    </div>
  )
}
