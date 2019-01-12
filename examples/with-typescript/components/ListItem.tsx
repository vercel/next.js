import * as React from 'react'
import {DataObject} from "./List";

export interface Props {
    data: DataObject
}

const ListItem: React.FunctionComponent<Props> = ({ data }) => (
  <React.Fragment>{data.id}:{data.name}</React.Fragment>
);

export default ListItem;