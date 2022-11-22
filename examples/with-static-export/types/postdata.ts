export interface PostData {
  userId: number
  id: number
  title: string
  body: string
}

export interface PostDataProps {
  postData: PostData
}

export interface PostDataListProps {
  postDataList: PostData[]
}
