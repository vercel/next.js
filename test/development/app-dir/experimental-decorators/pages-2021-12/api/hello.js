let text = 'hello'

function loggedClass(descriptor) {
  if (descriptor.kind !== 'class') {
    throw new Error(`Unexpected decorator kind: ${descriptor.kind}`)
  }

  return {
    ...descriptor,
    finisher() {
      text += ' world'
    },
  }
}

export default function handler(_req, res) {
  if (Test.name !== 'Test') {
    throw new Error(`Unexpected class name: ${Test.name}`)
  }

  res.status(200).json({ text })
}

@loggedClass
class Test {}
