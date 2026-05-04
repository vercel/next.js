module.exports = {
  experimental: {
    // This fixture sends SIGKILL to the worker process, which only works with
    // child processes, not worker threads.
    workerThreads: false,
  },
}
