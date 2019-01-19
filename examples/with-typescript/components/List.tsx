import * as React from "react"
import ListItem from './ListItem'

export interface DataObject {
    id: number,
    name: string
}

const List : React.FunctionComponent = () => {
    const dataArray : DataObject[] =
        [{id: 101, name: 'larry'}, {id: 102, name: 'sam'}, {id: 103, name: 'jill'}]
    return (
        <ul>
            {dataArray.map(item => (
                <li key={item.id}>
                    <ListItem data={item}/>
                </li>
            ))}
        </ul>
    )
}

export default List;
