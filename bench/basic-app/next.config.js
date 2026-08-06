module.exports = {
  // Deployed apps serve assets with a deployment marker in the query
  // string (e.g. ?dpl=... on Vercel), which every chunk entry in Flight
  // client-reference import rows carries. Set one so import-row bytes
  // match production payloads instead of bare local chunk paths.
  deploymentId: 'dpl_BenchFixture0123456789abcdef',
}
