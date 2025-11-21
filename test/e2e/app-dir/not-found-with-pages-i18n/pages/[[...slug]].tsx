import React from 'react'

export const getStaticProps = ({ params }: { params: { slug: string[] } }) => {
  try {
    const slugArray = Array.isArray(params.slug) ? params.slug : [params.slug]

    const isValidPath =
      slugArray.length === 1 &&
      (slugArray[0] === 'about' || slugArray[0] === 'contact')

    if (!isValidPath) {
      return {
        notFound: true,
      }
    }

    return {
      props: {
        slug: params.slug,
      },
    }
  } catch (error) {
    throw error
  }
}

export const getStaticPaths = async () => ({
  paths: [],
  fallback: 'blocking',
})

const CatchAll = () => (
  <div>
    <h1>Catch All</h1>
    <p>This is a catch all page added to the pages router</p>
  </div>
)

export default CatchAll
