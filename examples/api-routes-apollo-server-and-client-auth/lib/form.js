export function getStatusFrom(error) {
  const validationErrors = {}
  if (error.graphQLErrors) {
    for (const graphQLError of error.graphQLErrors) {
      if (
        graphQLError.extensions &&
        graphQLError.extensions.code === 'BAD_USER_INPUT'
      ) {
        return { '': graphQLError.message }
      }
    }
  }

  return validationErrors
}
