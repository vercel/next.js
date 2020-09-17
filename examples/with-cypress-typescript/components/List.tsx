import ListItem from './ListItem'
import { User } from '../interfaces'

type Props = {
  items: User[]
}

const List = ({ items }: Props) => (
  <ul data-test="users-list">
    {items.map((item) => (
      <li data-test={`user-${item.id}`} key={item.id}>
        <ListItem data={item} />
      </li>
    ))}
  </ul>
)

export default List
