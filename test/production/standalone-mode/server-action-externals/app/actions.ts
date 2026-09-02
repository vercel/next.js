'use server'

import _ from 'lodash'
import Queue from 'yocto-queue'

export async function doStuff() {
  const queue = new Queue<string>()
  queue.enqueue(_.camelCase('hello world'))
  return queue.dequeue() ?? ''
}
