import * as React from 'react'

import { User } from '../interfaces'

const e = React.createElement

type ListDetailProps = {
  item: User
}

const ListDetail = ({ item: user }: ListDetailProps) =>
  e('div', {}, e('h1', {}, 'Detail for ', user.name), e('p', 'ID: ', user.id))

export default ListDetail
