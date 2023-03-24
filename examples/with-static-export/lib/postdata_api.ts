import { type IPost } from '../@types/global'

export async function GetPost(id: string): Promise<IPost> {
  const response = await fetch(
    `https://jsonplaceholder.typicode.com/posts/${id}`
  )
  const post = (await response.json()) as IPost
  return post
}

export async function GetPosts(): Promise<IPost[]> {
  const response = await fetch(
    'https://jsonplaceholder.typicode.com/posts?_page=1'
  )
  const postList = (await response.json()) as IPost[]
  return postList
}
