const asset1 = require.resolve('./asset1.txt')

function loader() {}
loader(require.resolve('./asset2.txt'))

unknown(require.resolve('./input.js') + '/../asset1.txt')

const thing = asdf(require.resolve('./asset3.txt'))

require.resolve('./dep1.js')
