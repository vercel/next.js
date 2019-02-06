import * as React from 'react'

import IDataObject from '../interfaces';

type ListDetailProps = {
  item: IDataObject;
}

const ListDetail: React.FC<ListDetailProps> = ({ item: user }) => (
  <div>
    <h1>Detail for {user.name}</h1>
    <p>ID: {user.id}</p>
  </div>
)

export default ListDetail;
