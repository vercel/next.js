import request from 'graphql-request'
import { GetServerSideProps } from 'next'
import {
  MoreSitemapPostsDocument,
  MoreSitemapPostsQuery,
  MoreSitemapPostsQueryVariables,
  SitemapDocument,
  SitemapQuery,
  SitemapQueryVariables,
} from '../generated/graphql'
import { getSitemap } from '../utils/seo/sitemap'

const GQL_ENDPOINT = process.env.NEXT_PUBLIC_HASHNODE_GQL_ENDPOINT
const MAX_POSTS = 1000
const Sitemap = () => null

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const { res } = ctx

  const initialData = await request<SitemapQuery, SitemapQueryVariables>(
    GQL_ENDPOINT,
    SitemapDocument,
    {
      host: process.env.NEXT_PUBLIC_HASHNODE_PUBLICATION_HOST,
      postsCount: 20,
      staticPagesCount: 50,
    }
  )

  const publication = initialData.publication
  if (!publication) {
    return {
      notFound: true,
    }
  }
  const posts = publication.posts.edges.map((edge) => edge.node)

  // Get more posts by pagination if exists
  const initialPageInfo = publication.posts.pageInfo
  const fetchPosts = async (after: string | null | undefined) => {
    const variables = {
      host: process.env.NEXT_PUBLIC_HASHNODE_PUBLICATION_HOST,
      postsCount: 20,
      postsAfter: after,
    }

    const data = await request<
      MoreSitemapPostsQuery,
      MoreSitemapPostsQueryVariables
    >(GQL_ENDPOINT, MoreSitemapPostsDocument, variables)
    const publication = data.publication
    if (!publication) {
      return
    }
    const pageInfo = publication.posts.pageInfo

    posts.push(...publication.posts.edges.map((edge) => edge.node))

    if (pageInfo.hasNextPage && posts.length < MAX_POSTS) {
      await fetchPosts(pageInfo.endCursor)
    }
  }

  if (initialPageInfo.hasNextPage) {
    await fetchPosts(initialPageInfo.endCursor)
  }

  const xml = getSitemap({
    ...publication,
    posts,
  })

  res.setHeader('Cache-Control', 's-maxage=1, stale-while-revalidate')
  res.setHeader('content-type', 'text/xml')
  res.write(xml)
  res.end()

  return { props: {} }
}

export default Sitemap
