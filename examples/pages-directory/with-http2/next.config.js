/** @type {import('next').NextConfig} */
module.exports = {
  /*  this needs to be set to false until a bug in the compression npm module gets fixed. 
reference: https://github.com/expressjs/compression/issues/122
  */
  compress: false,
}
