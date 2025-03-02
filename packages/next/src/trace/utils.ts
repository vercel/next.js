import v8 from 'v8'
import os from 'os'

export const getDefaultTraceAttributes = () => ({
  cpus: String(os.cpus().length),
  platform: os.platform(),
  'memory.freeMem': String(os.freemem()),
  'memory.totalMem': String(os.totalmem()),
  'memory.heapSizeLimit': String(v8.getHeapStatistics().heap_size_limit),
})
