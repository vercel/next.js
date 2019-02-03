import * as React from 'react'
import Link from 'next/link';

import IDataObject from '../interfaces'

type Props = {
  data: IDataObject,
}

const ListItem: React.FunctionComponent<Props> = ({ data }) => (
  <Link href={`/detail?id=${data.id}`} passHref>
    <a>{data.id}: {data.name}</a>
  </Link>
);

export default ListItem
