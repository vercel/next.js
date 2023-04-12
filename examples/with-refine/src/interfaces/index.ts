export interface IPost {
  id: string
  title: string
  status: 'published' | 'draft' | 'rejected'
  createdAt: string
  category: ICategory
}

export interface ICategory {
  id: string
  title: string
}

export interface IUser {
  id: string
  firstName: string
  lastName: string
  email: string
}
