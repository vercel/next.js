import Header from './header'
import PostHeader from './post-header'
import PostBody from './post-body'
import SectionSeparator from './section-separator'
import Head from 'next/head'
import { CMS_NAME } from '../lib/constants'

export default function PostDetails({ post }) {
  return (
    <>
      <Header />
      <article>
        <Head>
          <title>
            {post.title} | Next.js Blog Example with {CMS_NAME}
          </title>
          <meta property="og:image" content={post.ogImage.url} />
        </Head>
        <PostHeader
          title={post.title}
          coverImage={post.coverImage}
          date={post.date}
          author={post.author}
        />
        <PostBody content={post.content} />
      </article>
      <SectionSeparator />
    </>
  )
}

// The data returned here will be send as `props` to the component
PostDetails.getCustomInitialProps = async function ({ client, pageInSitemap }) {
  const contentID = pageInSitemap.contentID
  const post = await client.getPostDetails({ contentID })

  return {
    post,
  }
}
