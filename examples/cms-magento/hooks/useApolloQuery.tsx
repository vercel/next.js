import { DocumentNode } from 'graphql'

import { initializeApollo } from 'lib/apolloClient'
import { IVariables } from 'interfaces/variable'

const useApolloQuery = () => {
  const apolloClient = initializeApollo()

  /**
   * REUSABLE APOLLO QUERY TO FETCH THE DATA
   */
  const getApolloQuery = async (query: DocumentNode, variables: IVariables) => {
    const { customerId, guestId, token, fetchPolicy } = variables

    const cartId = !!customerId ? customerId : guestId

    const params = { ...variables, cartId }

    // const checkIfVariablesAreEmpty =
    //   Object.keys(variables).length > 0 && params;

    const { loading, errors, data } = await apolloClient.query({
      query,
      fetchPolicy,
      variables: params,
      context: {
        headers: {
          authorization: token ? `Bearer ${token}` : '',
        },
      },
    })

    return {
      loading,
      errors,
      data,
    }
  }

  /**
   * REUSABLE APOLLO QUERY TO MUTATE THE DATA
   */
  const mutateApolloQuery = async (
    query: DocumentNode,
    variables: IVariables
  ) => {
    const { customerId, guestId, token } = variables

    const cartId = !!customerId ? customerId : guestId

    const params = {
      ...variables,
      cartId,
      token,
    }

    const checkIfVariablesAreEmpty = Object.keys(variables).length > 0 && params

    const { data, errors } = await apolloClient.mutate({
      mutation: query,
      variables: !!checkIfVariablesAreEmpty && params,
      context: {
        headers: {
          authorization: token ? `Bearer ${token}` : '',
        },
      },
    })

    console.log('data', data)

    return {
      data,
      errors,
    }
  }

  return {
    getApolloQuery,
    mutateApolloQuery,
  }
}

export default useApolloQuery
