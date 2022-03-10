import React, { useEffect, useState } from 'react'
import moment from 'moment'
import parse from 'html-react-parser'
import { getBlogPostRes, getBlogBannerRes } from '../../helper/index'
import { onEntryChange } from '../../sdk-plugin/index'
import RenderComponents from '../../components/render-components'
import ArchiveRelative from '../../components/archive-relative'

export default function BlogPost(props) {
  const { banner, result, entryUrl } = props
  const [getEntry, setEntry] = useState(result)
  const [getBanner, setBanner] = useState(banner)

  async function fetchData() {
    try {
      console.info('fetching blog post entries live preview data...')
      const entryRes = await getBlogPostRes(entryUrl)
      const bannerRes = await getBlogBannerRes('/blog')
      setEntry(entryRes)
      setBanner(bannerRes)
    } catch (error) {
      console.error(error)
    }
  }

  useEffect(() => {
    onEntryChange(() => {
      fetchData()
    })
  }, [result, banner])

  return (
    <>
      {banner.page_components && (
        <RenderComponents
          pageComponents={getBanner?.page_components}
          blogsPage
          contentTypeUid="blog_post"
          entryUid={getEntry.uid}
          locale={getEntry.locale}
        />
      )}
      <div className="blog-container">
        <div className="blog-detail">
          <h2>{getEntry.title ? getEntry.title : ''}</h2>
          <p>
            {moment(getEntry.date).format('ddd, MMM D YYYY')},{' '}
            <strong>{getEntry.author[0].title}</strong>
          </p>
          {typeof getEntry.body === 'string' && parse(getEntry.body)}
        </div>
        <div className="blog-column-right">
          <div className="related-post">
            {getBanner?.page_components[2].widget && (
              <h2>{getBanner.page_components[2].widget.title_h2}</h2>
            )}
            {getEntry?.related_post && (
              <ArchiveRelative blogs={getEntry?.related_post} />
            )}
          </div>
        </div>
      </div>
    </>
  )
}
export async function getServerSideProps({ params }) {
  try {
    const banner = await getBlogBannerRes('/blog')
    const blog = await getBlogPostRes(`/blog/${params.post}`)
    return {
      props: {
        entryUrl: `/blog/${params.post}`,
        result: blog,
        banner,
      },
    }
  } catch (error) {
    return { notFound: true }
  }
}
