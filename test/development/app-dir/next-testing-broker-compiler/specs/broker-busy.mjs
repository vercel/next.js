import { test } from 'vitest'

test('requires process ownership to stop uncooperative work', () => {
  console.log('BROKER_FILE_PID=' + process.pid)
  while (true) {}
})
