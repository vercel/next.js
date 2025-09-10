module.exports = {
  compiler: {
    define: {
      MY_MAGIC_VARIABLE: 'foobar',
      'process.env.MY_MAGIC_EXPR': 'barbaz',
    },
    defineServer: {
      MY_SERVER_VARIABLE: 'server',
      'process.env.MY_MAGIC_SERVER_EXPR': 'serverbarbaz',
    },
  },
}
