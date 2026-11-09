const option = process.env.ROUTING_NORMALIZATION_OPTION

module.exports = {
  ...(option === 'current' || option === 'conflict'
    ? { skipProxyUrlNormalize: true }
    : {}),
  ...(option === 'alias' || option === 'conflict'
    ? { skipMiddlewareUrlNormalize: true }
    : {}),
}
