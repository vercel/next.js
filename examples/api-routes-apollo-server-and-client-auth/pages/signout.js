import React from 'react'
import { useMutation } from '@apollo/react-hooks'

import gql from 'graphql-tag'
import { useRouter } from 'next/router'
import { withApollo } from '../apollo/client'

const SignOutMutation = gql`
  mutation SignOutMutation {
    signOut
  }
`

function SignOut() {
  const router = useRouter()
  const [signOut] = useMutation(SignOutMutation)

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      signOut().then(() => {
        router.push('/signin')
      })
    }
  }, [signOut, router])

  return <p>Signing out...</p>
}

export default withApollo(SignOut)
