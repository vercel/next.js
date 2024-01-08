import { buildConfig } from 'payload/config'
import path from 'path'
import { Users } from './collections/Users'
import { Pages } from './collections/Pages'
import { MainMenu } from './globals/MainMenu'
import { cloudStorage } from '@payloadcms/plugin-cloud-storage'
import { s3Adapter } from '@payloadcms/plugin-cloud-storage/s3'
import { Media } from './collections/Media'
import { slateEditor } from '@payloadcms/richtext-slate'
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { webpackBundler } from '@payloadcms/bundler-webpack'

const adapter = s3Adapter({
  config: {
    endpoint: `https://${process.env.NEXT_PUBLIC_S3_HOSTNAME}`,
    region: process.env.S3_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID as string,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY as string,
    },
  },
  bucket: process.env.NEXT_PUBLIC_S3_BUCKET as string,
})

export default buildConfig({
  editor: slateEditor({}),
  db: mongooseAdapter({
    url: process.env.MONGODB_URI as string,
  }),
  admin: {
    bundler: webpackBundler(),
  },
  collections: [Pages, Users, Media],
  globals: [MainMenu],
  typescript: {
    outputFile: path.resolve(__dirname, '../payload-types.ts'),
  },
  graphQL: {
    schemaOutputFile: path.resolve(__dirname, 'generated-schema.graphql'),
  },
  plugins: [
    cloudStorage({
      collections: {
        media: {
          adapter,
          disablePayloadAccessControl: true,
        },
      },
    }),
  ],
})
