'use client'

export default function Page() {
  innerFunction()
}

function innerFunction() {
  innerArrowFunction()
}

const innerArrowFunction = () => {
  require('../separate-file')
}
