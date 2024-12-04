export default async function Page({ searchParams }) {
  innerFunction()
}

function innerFunction() {
  innerArrowFunction()
}

const innerArrowFunction = () => {
  require('../separate-file')
}
