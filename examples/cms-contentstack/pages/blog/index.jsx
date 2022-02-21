import React, { useState, useEffect } from 'react'
import { onEntryChange } from '../../sdk-plugin/index'
import RenderComponents from '../../components/render-components'
import BlogList from '../../components/blog-list'
import { getBlogBannerRes, getBlogListRes } from '../../helper/index'

import ArchiveRelative from '../../components/archive-relative'

export default function Blog(props) {
  const { archived, result, blogList, entryUrl } = props
  const [getArchived] = useState(archived)
  const [getList] = useState(blogList)
  const [getBanner, setBanner] = useState(result)

  async function fetchData() {
    try {
      console.info('fetching live preview data...')
      const bannerRes = await getBlogBannerRes(entryUrl)
      setBanner(bannerRes)
    } catch (error) {
      console.error(error)
    }
  }

  useEffect(() => {
    onEntryChange(() => {
      fetchData()
    })
  }, [])

  return (
    <>
      {getBanner.page_components && (
        <RenderComponents
          pageComponents={getBanner.page_components}
          blogsPage
          contentTypeUid="page"
          entryUid={getBanner.uid}
          locale={getBanner.locale}
        />
      )}
      <div className="blog-container">
        <div className="blog-column-left">
          {getList?.map((bloglist, index) => (
            <BlogList bloglist={bloglist} key={index} />
          ))}
        </div>
        <div className="blog-column-right">
          {getBanner.page_components[1].widget && (
            <h2>{getBanner.page_components[1].widget.title_h2}</h2>
          )}
          <ArchiveRelative blogs={getArchived} />
        </div>
      </div>
    </>
  )
}

export async function getServerSideProps(context) {
  try {
    const blog = await getBlogBannerRes(context.resolvedUrl)
    const result = await getBlogListRes()
    const archived = []
    const blogList = []
    result.forEach((blogs) => {
      if (blogs.is_archived) {
        archived.push(blogs)
      } else {
        blogList.push(blogs)
      }
    })
    return {
      props: {
        entryUrl: context.resolvedUrl,
        result: blog,
        blogList,
        archived,
      },
    }
  } catch (error) {
    console.error(error)
    return { notFound: true }
  }
}
