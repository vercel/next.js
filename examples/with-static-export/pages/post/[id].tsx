import Link from 'next/link'
import Head from 'next/head'
import React from 'react'
import { GetStaticProps, GetStaticPaths, NextPage } from 'next'
import { type ParsedUrlQuery } from 'querystring'
import { GetPosts, GetPost } from '../../lib/postdata_api'
import { type PostData } from '../../@types/global'

interface Params extends ParsedUrlQuery {
  id: string
}

export const getStaticPaths: GetStaticPaths<Params> = async () => {
  const postList = await GetPosts()
  return {
    paths: postList.map((post) => ({
      params: {
        id: post.id.toString(),
      },
    })),
    fallback: false,
  }
}

export const getStaticProps: GetStaticProps<{ post: PostData }, Params> = async (
  context
) => {
  const { id } = context.params! as Params
  const post = await GetPost(id)
  return {
    props: {
      post,
    },
  }
}

const Post: NextPage<{post: PostData}> = ({ post }) => {
  return (
    <main>
      <Head>
        <title>{post.title}</title>
      </Head>

      <h1>{post.title}</h1>

      <p>{post.body}</p>

      <Link href="/">Go back to home</Link>
    </main>
  )
}

export default Post
