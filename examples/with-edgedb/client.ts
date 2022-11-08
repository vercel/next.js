import { createClient } from 'edgedb'
import e from './dbschema/edgeql-js'

// reads value of EDGEDB_DSN automatically
export const client = createClient({
  // TLS configuration is beyond the scope of this example project
  tlsSecurity: 'insecure',
})
export { e }
