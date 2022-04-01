import React, { useState, useEffect } from 'react'
import { onEntryChange } from '../../sdk-plugin/index'
import RenderComponents from '../../components/render-components'
import BlogList from '../../components/blog-list'
import { getPageRes, getBlogListRes } from '../../helper'

import ArchiveRelative from '../../components/archive-relative'

export default function Blog({ archivePost, page, blogList }) {
  const [getEntry, setEntry] = useState(page)

  useEffect(() => {
    async function fetchData() {
      try {
        const bannerRes = await getPageRes('/blog')
        setEntry(bannerRes)
      } catch (error) {
        console.error(error)
      }
    }
    onEntryChange(() => fetchData())
  }, [])

  return (
    <>
      {getEntry && (
        <RenderComponents
          pageComponents={getEntry.page_components}
          blogsPage
          contentTypeUid="page"
          entryUid={getEntry.uid}
          locale={getEntry.locale}
        />
      )}
      <div className="blog-container">
        <div className="blog-column-left">
          {blogList?.map((bloglist, index) => (
            <BlogList bloglist={bloglist} key={index} />
          ))}
        </div>
        <div className="blog-column-right">
          {getEntry.page_components[1].widget && (
            <h2 {...getEntry.page_components[1].widget.$?.title_h2}>
              {getEntry.page_components[1].widget.title_h2}
            </h2>
          )}
          <ArchiveRelative blogs={archivePost} />
        </div>
      </div>
    </>
  )
}

export const getStaticProps = async () => {
  try {
    const resPage = await getPageRes('/blog')
    const resBlog = await getBlogListRes()

    if (!resPage || !resBlog) throw new Error('Not found')
    const archived = []
    const blogLists = []

    resBlog.forEach((blogs) => {
      if (blogs.is_archived) {
        archived.push(blogs)
      } else {
        blogLists.push(blogs)
      }
    })

    return {
      props: {
        page: resPage,
        blogList: blogLists,
        archivePost: archived,
      },
      revalidate: 1000,
    }
  } catch (error) {
    console.error(error)
    return {
      notFound: true,
    }
  }
}
