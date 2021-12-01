import React from 'react'
import Link from 'next/link'

import { User } from '../interfaces'

const e = React.createElement

type Props = {
  data: User
}

const ListItem = ({ data }: Props) =>
  e(
    Link,
    { href: '/users/[id]', as: `/users/${data.id}` },
    e('a', {}, data.id, ': ', data.name)
  )

export default ListItem
