export async function getQueueValue() {
  const { default: Queue } = await import('yocto-queue')
  const queue = new Queue()
  queue.enqueue('ok')
  return queue.dequeue()
}
