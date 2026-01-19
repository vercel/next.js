// This file has an intentional type error
const invalidValue: string = 123

export default function WithTypeError() {
  return <div>WithTypeError: {invalidValue}</div>
}
