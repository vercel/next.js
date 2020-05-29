// relay.config.js
module.exports = {
  src: './src', // Path to the folder containing your Reason files
  schema: './schema/schema.graphql', // Path to the schema.graphql you've exported from your API. Don't know what this is? It's a saved introspection of what your schema looks like. You can run `npx get-graphql-schema http://path/to/my/graphql/server > schema.graphql` in your root to generate it
  artifactDirectory: './src/__generated__', // The directory where all generated files will be emitted
  // You can add type definitions for custom scalars here.
  // Whenever a custom scalar is encountered, the type emitted will correspond to the definition defined here. You can then deal with the type as needed when accessing the data.
}
