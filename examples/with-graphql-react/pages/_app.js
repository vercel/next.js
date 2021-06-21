import '../node-polyfills'
import withGraphQLReact from 'next-graphql-react/public/withGraphQLReact.js'
import withServerContext from 'next-server-context/public/withServerContext.js'
import App from 'next/app'

export default withGraphQLReact(withServerContext(App))
