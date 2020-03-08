import { Image } from 'react-datocms'

export default function CoverImage({ title, responsiveImage }) {
  return (
    <div className="-mx-5 sm:mx-0">
      <Image
        data={{
          ...responsiveImage,
          alt: `Cover Image for ${title}`,
        }}
        className="shadow-magical"
      />
    </div>
  )
}
