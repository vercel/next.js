export type User = {
  name: string
  image: string
  id: string
}

export type Session = {
  user: {
    name: string
    email: string
    image: string
    id: string
    role: 'admin' | 'user'
  }
  expires: string
}

export type Comment = {
  id: string
  created_at: number
  url: string
  text: string
  user: User
}

export type Post = {
  slug?: string
  title?: string
  author?: string
  date?: Date
  content?: string
  excerpt?: string
}
