import React, { useEffect, useState } from 'react'
import moment from 'moment'
import parse from 'html-react-parser'
import { getBlogListRes, getBlogPostRes, getPageRes } from '../../helper'
import { onEntryChange } from '../../sdk-plugin/index'
import RenderComponents from '../../components/render-components'
import ArchiveRelative from '../../components/archive-relative'

export default function BlogPost({ page, post, entryUrl }) {
  const [getEntry, setEntry] = useState({ banner: page, post })

  useEffect(() => {
    async function fetchData() {
      try {
        const entryRes = await getBlogPostRes(entryUrl)
        const bannerRes = await getPageRes('/blog')
        setEntry({ banner: bannerRes, post: entryRes })
      } catch (error) {
        console.error(error)
      }
    }
    onEntryChange(() => fetchData())
  }, [page, post, entryUrl])

  return (
    <>
      {getEntry.banner && (
        <RenderComponents
          pageComponents={getEntry.banner?.page_components}
          blogsPage
          contentTypeUid="blog_post"
          entryUid={getEntry.banner.uid}
          locale={getEntry.banner.locale}
        />
      )}
      <div className="blog-container">
        <div className="blog-detail">
          <h2 {...getEntry.post.$?.title}>
            {getEntry.post ? getEntry.post.title : ''}
          </h2>
          <p {...getEntry.post.$?.date}>
            {moment(getEntry.post.date).format('ddd, MMM D YYYY')},{' '}
            <strong {...getEntry.post.author[0].$?.title}>
              {getEntry.post.author[0].title}
            </strong>
          </p>
          {typeof getEntry.post.body === 'string' && (
            <div {...getEntry.post.$?.body}> {parse(getEntry.post.body)}</div>
          )}
        </div>
        <div className="blog-column-right">
          <div className="related-post">
            {getEntry.banner?.page_components[2].widget && (
              <h2 {...getEntry.banner?.page_components[2].widget.$?.title_h2}>
                {getEntry.banner?.page_components[2].widget.title_h2}
              </h2>
            )}
            {getEntry.post?.related_post && (
              <ArchiveRelative blogs={getEntry.post?.related_post} />
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export const getStaticProps = async ({ params }) => {
  try {
    if (!params || !params.post) return { props: { post: null, pageUrl: '' } }
    const paramsPath = params.post.includes('/blog')
      ? `${params.post}`
      : `/blog/${params?.post}`

    const blogPostRes = await getBlogPostRes(paramsPath)
    const pageRes = await getPageRes('/blog')

    if (!blogPostRes || !pageRes) throw new Error('Error 404')
    return {
      props: {
        page: pageRes,
        post: blogPostRes,
        entryUrl: paramsPath,
      },
    }
  } catch (error) {
    console.error(error)
    return {
      notFound: true,
    }
  }
}

export const getStaticPaths = async () => {
  const entryPaths = await getBlogListRes()
  const paths = []
  entryPaths.forEach((entry) => {
    paths.push({ params: { post: entry.url.toString() } })
  })

  return {
    paths,
    fallback: 'blocking',
  }
}
