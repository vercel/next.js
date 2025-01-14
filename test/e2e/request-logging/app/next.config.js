module.exports = {
  logging: {
    incomingRequest: {
      ignore: [/^\/api\//, /^\/healthcheck/, /^\/_next\/static\//],
    },
  },
}
