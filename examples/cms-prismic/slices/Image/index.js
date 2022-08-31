import { PrismicNextImage } from '@prismicio/next'

/**
 * @typedef {import('../../types.generated').ImageSlice} ImageSlice
 *
 * @param {import('@prismicio/react').SliceComponentProps<ImageSlice>}
 */
const Image = ({ slice }) => {
  return (
    <section className="my-12">
      <PrismicNextImage field={slice.primary.image} layout="responsive" />
    </section>
  )
}

export default Image
