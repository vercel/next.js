const order = []

exports.order = order

order.push('start')

exports.used = 'used-value'
exports.impure = pushAndReturn('impure')
exports.unused = 'unused-value'

order.push('end')

function pushAndReturn(name) {
  order.push(name)
  return name
}
