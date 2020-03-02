import React from 'react'
import { NextPage, NextPageContext } from 'next'
import withData from '../lib/withData'
import BlogPosts from '../components/BlogPosts'
import indexPageQuery from '../queries/indexPage'
import { indexPage_indexQueryResponse } from '../queries/__generated__/indexPage_indexQuery.graphql'

const Index = ({ viewer }: NextPageContext & indexPage_indexQueryResponse) => (
  <div>
    <BlogPosts viewer={viewer} />
  </div>
)

export default withData(Index as NextPage, {
  query: indexPageQuery,
})
