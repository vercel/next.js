import { useMutation, useQuery } from "@apollo/client";
import { graphql } from "lib/gql";
import Link from "next/link";
import { useState } from "react";
import { initializeApollo } from "../lib/apollo";

const updateNameDocument = graphql(/* GraphQL */ `
  mutation UpdateName($name: String!) {
    updateName(name: $name) {
      id
      name
      status
    }
  }
`);

const viewerDocument = graphql(/* GraphQL */ `
  query Viewer {
    viewer {
      id
      name
      status
    }
  }
`);

const Index = () => {
  const { data } = useQuery(viewerDocument);
  const [newName, setNewName] = useState("");
  const [updateNameMutation] = useMutation(updateNameDocument);

  const onChangeName = () => {
    updateNameMutation({
      variables: {
        name: newName,
      },
      // Follow apollo suggestion to update cache
      //  https://www.apollographql.com/docs/angular/features/cache-updates/#update
      update: (cache, mutationResult) => {
        const { data } = mutationResult;
        if (!data) return; // Cancel updating name in cache if no data is returned from mutation.
        // Read the data from our cache for this query.
        const result = cache.readQuery({
          query: viewerDocument,
        });

        const newViewer = result ? { ...result.viewer } : null;
        // Add our comment from the mutation to the end.
        // Write our data back to the cache.
        if (newViewer) {
          newViewer.name = data.updateName.name;
          cache.writeQuery({
            query: viewerDocument,
            data: { viewer: newViewer },
          });
        }
      },
    });
  };

  const viewer = data.viewer;

  return viewer ? (
    <div>
      You're signed in as {viewer.name} and you're {viewer.status}. Go to the{" "}
      <Link href="/about">about</Link> page.
      <div>
        <input
          type="text"
          placeholder="your new name..."
          onChange={(e) => setNewName(e.target.value)}
        />
        <input type="button" value="change" onClick={onChangeName} />
      </div>
    </div>
  ) : null;
};

export async function getStaticProps() {
  const apolloClient = initializeApollo();

  await apolloClient.query({
    query: viewerDocument,
  });

  return {
    props: {
      initialApolloState: apolloClient.cache.extract(),
    },
  };
}

export default Index;
