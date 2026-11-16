async function getValue() {
  'use cache'

  if (process.env.TEST_CONDITIONAL === 'enabled') {
    return process.env.TEST_VALUE
  } else {
    return process.env.TEST_OTHER_VALUE
  }
}

export default async function Page() {
  return <p>{await getValue()}</p>
}
