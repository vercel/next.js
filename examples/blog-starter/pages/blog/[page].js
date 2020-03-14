import { withRouter } from 'next/router'
import _range from 'lodash.range'
import Link from 'next/link'
import pagination from 'pagination'
import Layout from '../../components/layouts/default'
import Post from '../../components/blog-index-item'
import blogposts from '../../posts/index'
import { siteMeta } from '../../blog.config'
import { useEffect } from 'react'

const Blog = ({ router, page = 1 }) => {
  const paginator = new pagination.SearchPaginator({
    prelink: '/',
    current: page,
    rowsPerPage: siteMeta.postsPerPage,
    totalResult: blogposts.length,
  })

  const {
    previous,
    range,
    next,
    fromResult,
    toResult,
  } = paginator.getPaginationData()
  const results = _range(fromResult - 1, toResult)
  useEffect(() => {
    console.info(paginator.getPaginationData())
  })

  return (
    <Layout pageTitle="Blog" path={router.pathname}>
      <header>
        <h1>Blog {page}</h1>
      </header>

      {blogposts
        .filter((_post, index) => results.indexOf(index) > -1)
        .map((post, index) => (
          <Post
            key={index}
            title={post.title}
            summary={post.summary}
            date={post.publishedAt}
            path={post.path}
          />
        ))}

      <ul>
        {previous && (
          <li>
            <Link href={'/blog/[page]'} as={`/blog/${previous}`}>
              <a>Previous</a>
            </Link>
          </li>
        )}
        {range.map((page, index) => (
          <li key={index}>
            <Link key={index} href={'/blog/[page]'} as={`/blog/${page}`}>
              <a>{page}</a>
            </Link>
          </li>
        ))}
        {next && (
          <li>
            <Link href={'/blog/[page]'} as={`/blog/${next}`}>
              <a>Next</a>
            </Link>
          </li>
        )}
      </ul>
      <style jsx>{`
        header {
          margin-bottom: 3em;
        }
      `}</style>
    </Layout>
  )
}

export async function getStaticProps({ params: { page } }) {
  return { props: { page } }
}

export async function getStaticPaths() {
  const rowsPerPage = siteMeta.postsPerPage
  const totalResult = blogposts.length
  const pageCount = Math.ceil(totalResult / rowsPerPage)
  const paths = Array.from(Array(pageCount)).map((_, index) => ({
    params: { page: `${index + 1}` },
  }))
  return {
    paths,
    fallback: true,
  }
}

export default withRouter(Blog)
