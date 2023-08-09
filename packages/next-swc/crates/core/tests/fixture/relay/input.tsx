const variableQuery = graphql`
  query InputVariableQuery {
    hello
  }
`

fetchQuery(graphql`
  query InputUsedInFunctionCallQuery {
    hello
  }
`)

function SomeQueryComponent() {
  useLazyLoadQuery(graphql`
    query InputInHookQuery {
      hello
    }
  `)
}

const variableMutation = graphql`
  query InputVariableMutation {
    someMutation
  }
`

commitMutation(
  environment,
  graphql`
    query InputUsedInFunctionCallMutation {
      someMutation
    }
  `
)

function SomeMutationComponent() {
  useMutation(graphql`
    query InputInHookMutation {
      someMutation
    }
  `)
}
