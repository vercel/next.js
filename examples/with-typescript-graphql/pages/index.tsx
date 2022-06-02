import { useMutation, useQuery } from '@apollo/client'
import { UpdateNameDocument, ViewerDocument } from 'lib/graphql-operations'
import Link from 'next/link'
import { useState } from 'react'
import { initializeApollo } from '../lib/apollo'

const Index = () => {
  const { data } = useQuery(ViewerDocument)
  const [newName, setNewName] = useState('')
  const [updateNameMutation] = useMutation(UpdateNameDocument)

  const onChangeName = () => {
    updateNameMutation({
      variables: {
        name: newName,
      },
      // Follow apollo suggestion to update cache
      //  https://www.apollographql.com/docs/angular/features/cache-updates/#update
      update: (cache, mutationResult) => {
        const { data } = mutationResult
        if (!data) return // Cancel updating name in cache if no data is returned from mutation.
        // Read the data from our cache for this query.
        const result = cache.readQuery({
          query: ViewerDocument,
        })
        const newViewer = result ? { ...result.viewer } : null
        // Add our comment from the mutation to the end.
        // Write our data back to the cache.
        if (newViewer) {
          newViewer.name = data.updateName.name
          cache.writeQuery({
            query: ViewerDocument,
            data: { viewer: newViewer },
          })
        }
      },
    })
  }

  const viewer = data?.viewer

  return viewer ? (
    <div>
      You're signed in as {viewer.name} and you're {viewer.status}. Go to the{' '}
      <Link href="/about">
        <a>about</a>
      </Link>{' '}
      page.
      <div>
        <input
          type="text"
          placeholder="your new name..."
          onChange={(e) => setNewName(e.target.value)}
        />
        <input type="button" value="change" onClick={onChangeName} />
      </div>
    </div>
  ) : null
}

export async function getStaticProps() {
  const apolloClient = initializeApollo()

  await apolloClient.query({
    query: ViewerDocument,
  })

  return {
    props: {
      initialApolloState: apolloClient.cache.extract(),
    },
  }
}

export default Index
