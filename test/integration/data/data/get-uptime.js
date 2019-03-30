import { createHook } from 'next/data'
import os from 'os'

export default createHook('get-uptime', async () => {
  return os.uptime()
})
