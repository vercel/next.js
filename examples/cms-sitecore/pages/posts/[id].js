import {getAllPostsIds, getPostAndMorePosts} from '../../lib/api'

import { CMS_NAME } from '../../lib/constants'
import Container from '../../components/container'
import ErrorPage from 'next/error'
import Head from 'next/head'
import Header from '../../components/header'
import Layout from '../../components/layout'
import MoreStories from '../../components/more-stories'
import PostBody from '../../components/post-body'
import PostHeader from '../../components/post-header'
import PostTitle from '../../components/post-title'
import SectionSeparator from '../../components/section-separator'
import { useRouter } from 'next/router'

export default function Post({ post, morePosts, preview }) {
  const router = useRouter()  
  if (!router.isFallback && !post?.id) {    
    return <ErrorPage statusCode={404} />
  }
  return (
    <Layout preview={preview}>
      <Container>
        <Header />
        {router.isFallback ? (
          <PostTitle>Loading�</PostTitle>
        ) : (
          <>
            <article>
              <Head>
                <title>
                  {post.title} | Next.js Blog Example with {CMS_NAME}
                </title>
                <meta property="og:image" content={post.coverImage} />
              </Head>
              <PostHeader
                title={post.title}
                coverImage={post.coverImage}
                date={post.date}
                author={post.author}
              />
              <PostBody content={post.content} />
              
              {/* This is an example to test related content.  */}
              {/* <div>
                <h2>Example of related content!</h2>
                <p>There is a Promo content related to this post!</p>
                <ul>
                  <li>PROMO ID: {post.promo.id}</li>
                  <li>PROMO TITLE: {post.promo.contentName}</li>
                </ul>       
              </div> */}
            </article>
            <SectionSeparator />
            {morePosts.length > 0 && <MoreStories posts={morePosts} />}
          </>
        )}
      </Container>
    </Layout>
  )
}

export async function getStaticProps({ params, preview = null }) {
  const data = await getPostAndMorePosts(params.id, preview) ?? {}         
  return {
    props: {
      preview,
      post: data?.post[0] ?? {},
      morePosts: data?.morePosts ?? {},
    },
  }
}
  

export async function getStaticPaths() {
  const allPosts = await getAllPostsIds();  
  return {
    paths: allPosts?.map((post) => `/posts/${post.id}`) || [],
    fallback: true,
  }
}
