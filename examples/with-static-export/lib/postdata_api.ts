import { PostData } from '../types/postdata'

export async function GetPost(id: string): Promise<PostData> {
  const response = await fetch(
    `https://jsonplaceholder.typicode.com/posts/${id}`
  )
  const postData: PostData = (await response.json()) as PostData
  return postData
}

export async function GetPosts(): Promise<PostData[]> {
  const response = await fetch(
    'https://jsonplaceholder.typicode.com/posts?_page=1'
  )
  const postList: PostData[] = (await response.json()) as PostData[]
  return postList
}
