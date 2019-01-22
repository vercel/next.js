import * as React from 'react'
import IDataObject from '../interfaces'

type Props = {
  data: IDataObject,
}

const ListItem: React.FunctionComponent<Props> = ({ data }) => (
  <React.Fragment>{data.id}:{data.name}</React.Fragment>
);

export default ListItem
