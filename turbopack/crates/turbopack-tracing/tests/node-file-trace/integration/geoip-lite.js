const geoip = require('geoip-lite')

const ip = '207.97.227.239'
const geo = geoip.lookup(ip)
