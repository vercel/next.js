import * as React from "react"
import ListItem from './ListItem'
import IDataObject from '../interfaces'

interface IListProps {
  items: IDataObject[]
}

const List: React.FunctionComponent<IListProps> = ({ items }) => (
  <ul>
    {items.map((item) => (
      <li key={item.id}>
        <ListItem data={item} />
      </li>
    ))}
  </ul>
)

export default List
