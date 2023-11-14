import request from 'graphql-request'
import { GetServerSideProps } from 'next'
import {
  PublicationByHostDocument,
  PublicationByHostQuery,
  PublicationByHostQueryVariables,
} from '../generated/graphql'

const GQL_ENDPOINT = process.env.NEXT_PUBLIC_HASHNODE_GQL_ENDPOINT
const Dashboard = () => null

export const getServerSideProps: GetServerSideProps = async () => {
  const data = await request<
    PublicationByHostQuery,
    PublicationByHostQueryVariables
  >(GQL_ENDPOINT, PublicationByHostDocument, {
    host: process.env.NEXT_PUBLIC_HASHNODE_PUBLICATION_HOST,
  })

  const publication = data.publication
  if (!publication) {
    return {
      notFound: true,
    }
  }

  return {
    redirect: {
      destination: `https://hashnode.com/${publication.id}/dashboard`,
      permanent: false,
    },
  }
}

export default Dashboard
