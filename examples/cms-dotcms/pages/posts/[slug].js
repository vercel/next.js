import {useRouter} from 'next/router'
import Head from 'next/head'
import ErrorPage from 'next/error'
import Container from '../../components/container'
import PostBody from '../../components/post-body'
import MoreStories from '../../components/more-stories'
import Header from '../../components/header'
import PostHeader from '../../components/post-header'
import SectionSeparator from '../../components/section-separator'
import Layout from '../../components/layout'
import {getAllPostsWithSlug, getPostAndMorePosts} from '../../lib/api'
import PostTitle from '../../components/post-title'
import {CMS_NAME} from '../../lib/constants'

import  {DotSBRender} from '../../components/dotCMS/storyblock'
import DateComponent from "../../components/date";
import Avatar from "../../components/avatar";

export default function Post({post, morePosts, preview}) {
  const router = useRouter()


  if (!router.isFallback && !post) {
    return <ErrorPage statusCode={404}/>
  }

  return (
    <Layout preview={preview}>
      <Container>
        <Header/>
        {router.isFallback ? (
          <PostTitle>Loading…</PostTitle>
        ) : (
          <>
            <article>

              <Head>
                <title>
                  {post.title} | Next.js Blog Example with {CMS_NAME}
                </title>
                <meta property="og:image"
                      content={`${process.env.NEXT_PUBLIC_DOTCMS_HOST}${post.image.idPath}`}/>
              </Head>

              <PostHeader
                title={post.title}
                coverImage={post.image}
                date={post.postingDate}
                author={post.author}
              />

              <div className='prose lg:prose-xl max-w-2xl mx-auto'>
                <div className='block md:hidden mb-6'>
                  {post.author.length ? <Avatar name={`${post.author[0].firstName} ${post.author[0].lastName}`} picture={post.author[0].profilePhoto} /> : null}
                </div>
                <div className="mb-6 text-lg">
                  {post.postingDate != 'now' ? <div className="mb-6 text-lg">Posted <DateComponent dateString={post.postingDate} /></div> : null}
                </div>
                <DotSBRender {...post.blogContent.json} />
              </div>



            </article>

            <SectionSeparator/>

            {morePosts && morePosts.length > 0 && (
              <MoreStories posts={morePosts}/>
            )}

          </>
        )}
      </Container>
    </Layout>
  )
}

export async function getStaticProps({params, preview = false}) {
  const data = await getPostAndMorePosts(params.slug, preview)

  return {
    props: {
      preview,
      ...data,
    },
  }
}

export async function getStaticPaths() {
  const allPosts = await getAllPostsWithSlug()

  return {
    paths: allPosts?.map((post) => `/posts/${post.urlTitle}`) || [],
    fallback: true,
  }
}
