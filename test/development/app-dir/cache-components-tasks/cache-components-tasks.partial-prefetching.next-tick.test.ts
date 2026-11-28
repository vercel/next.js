process.env.__NEXT_PARTIAL_PREFETCHING = 'true'
process.env.__NEXT_SEQUENTIAL_TASK_SCHEDULING = 'unstable_next-tick'
require('./cache-components-tasks.test')
