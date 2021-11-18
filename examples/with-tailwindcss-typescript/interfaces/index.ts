type Author = {
  name: string
}

export type Book = {
  isbn: string
  title: string
  authors: Author[]
  publish_date: string
  cover: {
    small: string
    medium: string
    large: string
  }
}
