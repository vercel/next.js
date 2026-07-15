import _ from 'lodash'
import Queue from 'yocto-queue'

export default function Page() {
  const queue = new Queue<string>()
  queue.enqueue('direct')
  return (
    <p>
      {_.camelCase('direct route')} {queue.dequeue()}
    </p>
  )
}
