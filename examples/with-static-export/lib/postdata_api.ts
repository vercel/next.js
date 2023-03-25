import { type PostData } from '../@types/global'

export async function GetPost(id: string): Promise<PostData> {
  const response = await fetch(
    `https://jsonplaceholder.typicode.com/posts/${id}`
  )
  const post = (await response.json()) as PostData
  return post
}

export async function GetPosts(): Promise<PostData[]> {
  const response = await fetch(
    'https://jsonplaceholder.typicode.com/posts?_page=1'
  )
  const postList = (await response.json()) as PostData[]
  return postList
}
