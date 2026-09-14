import React from 'react'

const DynamicPage = (props) => (
  <>
    <div>DynamicPage</div>
    <div id="props">{JSON.stringify(props)}</div>
  </>
)

export const getStaticPaths = async ({ locales }) => {
  const paths = []

  for (const locale of locales) {
    paths.push({
      params: {
        slug: ['hello'],
      },
      locale,
    })
    paths.push({
      params: {
        slug: ['company', 'about-us'],
      },
      locale,
    })
  }

  return {
    fallback: false,
    paths,
  }
}

export const getStaticProps = async ({ params, locale }) => ({
  props: {
    locale,
    params,
    hello: 'world',
  },
})

export default DynamicPage
