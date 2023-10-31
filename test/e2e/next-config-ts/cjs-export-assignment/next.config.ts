const { NextConfig } = require('next')

const config: typeof NextConfig = {
  env: {
    customKey: 'my-value',
  },
}

export = config
