import { createHook } from 'next/data'
import os from 'os'

export default createHook(async () => {
  return os.uptime()
})
