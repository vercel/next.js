// Parallel builds are currently broken due to a limitation in grpc (a transitive firebase
// dependency). Until this is fixed, a workaround is to set the number of available CPUs to 1.
// https://github.com/zeit/next.js/issues/7894
// https://github.com/grpc/grpc-node/issues/778
module.exports = {
  experimental: {
    cpus: 1
  }
}
