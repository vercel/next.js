import { GetServerSideProps } from 'next'
import { GetListResponse } from '@refinedev/core'
import { useTable, List, getDefaultSortOrder } from '@refinedev/antd'
import { Table } from 'antd'
import dataProvider from '@refinedev/simple-rest'
import { parseTableParams } from '@refinedev/nextjs-router'

import { IUser } from 'src/interfaces'
import { authProvider } from 'src/authProvider'
import { API_URL } from 'src/constants'

export const UserList: React.FC<{ initialData: GetListResponse<IUser> }> = ({
  initialData,
}) => {
  const { tableProps, sorters } = useTable<IUser>({
    resource: 'users',
    queryOptions: {
      initialData,
    },
    syncWithLocation: true,
  })

  return (
    <List title="Users">
      <Table {...tableProps} rowKey="id">
        <Table.Column
          dataIndex="id"
          title="ID"
          sorter={{
            multiple: 1,
          }}
          defaultSortOrder={getDefaultSortOrder('id', sorters)}
        />
        <Table.Column
          dataIndex="firstName"
          title="Name"
          sorter={{ multiple: 2 }}
          defaultSortOrder={getDefaultSortOrder('firstName', sorters)}
        />
      </Table>
    </List>
  )
}

export default UserList

export const getServerSideProps: GetServerSideProps = async (context) => {
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
    resource: 'users',
    filters,
    pagination,
    sorters,
  })

  return {
    props: { initialData: data },
  }
}
