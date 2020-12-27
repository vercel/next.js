import React from 'react'

const DynamicPage = (props) => (
  <>
    <div>DynamicPage</div>
    <div id="props">{JSON.stringify(props)}</div>
  </>
)

export const getStaticPaths = async () => ({
  fallback: false,
  paths: [
    {
      params: {
        slug: ['hello'],
      },
    },
    {
      params: {
        slug: ['company', 'about-us'],
      },
    },
  ],
})

export const getStaticProps = async ({ params }) => ({
  props: {
    params,
    hello: 'world',
  },
})

export default DynamicPage
