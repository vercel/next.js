import { GetObjectCommand } from '@aws-sdk/client-s3'
import { isObject } from 'lodash'

export default function Page() {
  const command = new GetObjectCommand({
    Bucket: 'bucket',
    Key: 'key1',
  })
  return (
    <div>
      <div id="key">Key: {command.input.Key}</div>
      <div id="isObject">isObject: {String(isObject(command))}</div>
    </div>
  )
}
