/** @type {import('next').NextConfig} */
module.exports = {
  instrumentationClientInject: ['./inject-a.js', './inject-b.js'],
}
