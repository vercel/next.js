import * as React from 'react'
import IDataObject from '../interfaces'

export interface IProps {
  data: IDataObject
}

const ListItem: React.FunctionComponent<IProps> = ({ data }) => (
  <React.Fragment>{data.id}:{data.name}</React.Fragment>
);

export default ListItem
