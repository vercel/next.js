'use strict'

const { greet } = require('./dep')

exports.greeting = greet('world')
