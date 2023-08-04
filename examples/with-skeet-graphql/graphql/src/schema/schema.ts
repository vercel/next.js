import {
  connectionPlugin,
  makeSchema,
  asNexusMethod,
  queryComplexityPlugin,
} from 'nexus'
import { join } from 'path'
import * as allTypes from '../graphql'
import { relayNodeInterfacePlugin } from '@jcm/nexus-plugin-relay-node-interface'
import { relayGlobalIdPlugin } from '@jcm/nexus-plugin-relay-global-id'
import { relayNodeInterfacePluginConfig } from './Node'
import { GraphQLDateTime } from 'graphql-scalars'

export const schema = makeSchema({
  types: [allTypes, asNexusMethod(GraphQLDateTime, 'datetime', 'Date')],
  outputs: {
    typegen: join(__dirname, './nexus-typegen.ts'),
    schema: join(__dirname, './schema.graphql'),
  },
  plugins: [
    connectionPlugin({
      extendConnection: {
        totalCount: { type: 'Int', requireResolver: false },
      },
      includeNodesField: true,
    }),
    relayNodeInterfacePlugin(relayNodeInterfacePluginConfig),
    relayGlobalIdPlugin({
      shouldAddRawId: process.env.NODE_ENV === 'development' ? true : false,
    }),
    queryComplexityPlugin(),
  ],
})
