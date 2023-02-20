export type ImgixType = {
  url: string
  imgix_url: string
}

export type AuthorType = {
  title: string
  metadata: {
    picture: ImgixType
  }
}

export type PostType = {
  title: string
  slug: string
  content: string
  created_at: string
  metadata: {
    cover_image: ImgixType
    author: AuthorType
    excerpt: string
    content: string
  }
}
