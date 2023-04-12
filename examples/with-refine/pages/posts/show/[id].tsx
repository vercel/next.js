import { GetServerSideProps, NextPage } from 'next'
import { GetOneResponse, useOne, useShow } from '@refinedev/core'
import { Show } from '@refinedev/antd'
import { Typography, Tag } from 'antd'
import dataProvider from '@refinedev/simple-rest'

import { ICategory, IPost } from 'src/interfaces'
import { authProvider } from 'src/authProvider'
import { API_URL } from 'src/constants'

const { Title, Text } = Typography

interface Props {
  initialData: GetOneResponse<IPost>
}

const Page: NextPage<Props> = ({ initialData }) => {
  const { queryResult } = useShow({
    queryOptions: {
      initialData,
    },
  })
  const { data, isLoading } = queryResult
  const record = data?.data

  const { data: categoryData } = useOne<ICategory>({
    resource: 'categories',
    id: record?.category.id || '',
    queryOptions: {
      enabled: !!record?.category.id,
    },
  })

  return (
    <Show isLoading={isLoading}>
      <Title level={5}>Title</Title>
      <Text>{record?.title}</Text>

      <Title level={5}>Status</Title>
      <Text>
        <Tag>{record?.status}</Tag>
      </Text>

      <Title level={5}>Category</Title>
      <Text>{categoryData?.data.title}</Text>
    </Show>
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

  const data = await dataProvider(API_URL).getOne({
    resource: 'posts',
    id: context.params?.id as string,
  })

  return {
    props: {
      initialData: data,
    },
  }
}

export default Page
