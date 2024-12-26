export default async function Page({ searchParams }) {
  // We don't want the build to fail in production
  if (process.env.NODE_ENV === 'development') {
    innerFunction()
  }
  return <p>Hello Source Maps</p>
}

function innerFunction() {
  innerArrowFunction()
}

const innerArrowFunction = () => {
  require('../separate-file')
}
