import { GetServerSideProps, NextPage } from 'next'
import { GetListResponse } from '@refinedev/core'
import {
  useTable,
  List,
  EditButton,
  ShowButton,
  DeleteButton,
} from '@refinedev/antd'
import dataProvider from '@refinedev/simple-rest'
import { Table, Space } from 'antd'
import { parseTableParams } from '@refinedev/nextjs-router'

import { authProvider } from 'src/authProvider'
import { IPost } from 'src/interfaces'
import { API_URL } from 'src/constants'

interface Props {
  initialData: GetListResponse<IPost>
}

const Page: NextPage<Props> = ({ initialData }) => {
  const { tableProps } = useTable<IPost>({
    queryOptions: {
      initialData,
    },
  })

  return (
    <List>
      <Table {...tableProps} rowKey="id">
        <Table.Column dataIndex="id" title="ID" />
        <Table.Column dataIndex="status" title="Status" />
        <Table.Column dataIndex="title" title="Title" />
        <Table.Column<IPost>
          title="Actions"
          dataIndex="actions"
          render={(_text, record): React.ReactNode => {
            return (
              <Space>
                <EditButton size="small" recordItemId={record.id} />
                <ShowButton size="small" recordItemId={record.id} />
                <DeleteButton size="small" recordItemId={record.id} />
              </Space>
            )
          }}
        />
      </Table>
    </List>
  )
}

export const getServerSideProps: GetServerSideProps<{}> = async (context) => {
  const { authenticated, redirectTo } = await authProvider.check(context)

  if (!authenticated) {
    return {
      props: {},
      redirect: {
        destination: redirectTo,
        permanent: false,
      },
    }
  }

  context.res.setHeader(
    'Cache-Control',
    's-maxage=60, stale-while-revalidate=360'
  )

  const { pagination, filters, sorters } = parseTableParams(
    context.resolvedUrl?.split('?')[1] ?? ''
  )

  const data = await dataProvider(API_URL).getList({
    resource: 'posts',
    filters,
    pagination,
    sorters,
  })

  return {
    props: { initialData: data },
  }
}

export default Page
