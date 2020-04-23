import React from 'react'
import withData from '../lib/withData'
import BlogPosts from '../components/BlogPosts'
import indexPageQuery from '../queries/indexPage'

const Index = ({ viewer }) => (
  <div>
    <BlogPosts viewer={viewer} />
  </div>
)

export default withData(Index, {
  query: indexPageQuery,
})
