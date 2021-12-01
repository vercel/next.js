import * as React from 'react'
import ListItem from './ListItem'
import { User } from '../interfaces'

const e = React.createElement

type Props = {
  items: User[]
}

const List = ({ items }: Props) =>
  e(
    'ul',
    {},
    items.map((item) => e('li', { key: item.id }, e(ListItem, { data: item })))
  )

export default List
