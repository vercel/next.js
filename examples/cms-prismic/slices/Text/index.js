import { PrismicRichText } from '@prismicio/react'

/**
 * @typedef {import('../../types.generated').TextSlice} TextSlice
 *
 * @param {import('@prismicio/react').SliceComponentProps<TextSlice>}
 */
const Text = ({ slice }) => {
  return (
    <section className="text-lg leading-relaxed">
      <PrismicRichText
        field={slice.primary.text}
        components={{
          heading2: ({ children }) => (
            <h2 className="text-3xl mt-12 mb-4 leading-snug">{children}</h2>
          ),
          heading3: ({ children }) => (
            <h2 className="text-2xl mt-8 mb-4 leading-snug">{children}</h2>
          ),
          paragraph: ({ children }) => <p className="my-6">{children}</p>,
          list: ({ children }) => <ul className="my-6">{children}</ul>,
          oList: ({ children }) => <ol className="my-6">{children}</ol>,
        }}
      />
    </section>
  )
}

export default Text
