export interface Discussion {
  id: string
  title: string
  body: string
  url: string
  createdAt: string
  author: {
    login: string
  } | null
  category: {
    name: string
  } | null
}

export interface GraphQLDiscussionResponse {
  repository: {
    discussions: {
      nodes: Discussion[]
      pageInfo: {
        hasNextPage: boolean
        endCursor: string | null
      }
    }
  }
}
