exports.source = 'application'
exports.validate = function () {
  throw new Error(
    'The application schema-utils must not validate loader options'
  )
}
