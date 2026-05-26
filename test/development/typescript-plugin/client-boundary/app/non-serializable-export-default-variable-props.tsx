'use client'

type MyProps = {
  myFunc: () => void
}

const MyComponent = ({ myFunc }: MyProps) => {
  return <p>hello world</p>
}

export default MyComponent
