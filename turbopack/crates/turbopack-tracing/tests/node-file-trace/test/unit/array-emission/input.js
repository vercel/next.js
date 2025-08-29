'use strict'

const fs = require('fs')

const REPORT_JAVASCRIPT = [
  fs.readFileSync(__dirname + '/renderer/util.js', 'utf8'),
  fs.readFileSync(__dirname + '/renderer/dom.js', 'utf8'),
].join(';\n')
