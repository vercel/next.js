import { Content } from '@prismicio/client'
import { ImageField, RelationField, TitleField } from '@prismicio/types'

export type PostDocumentWithAuthor = Content.PostDocument & {
  data: {
    author: AuthorContentRelationshipField
  }
}

export type AuthorContentRelationshipField = RelationField<
  'author',
  string,
  {
    name: TitleField
    picture: ImageField
  }
>
