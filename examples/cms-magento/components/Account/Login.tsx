import { FC } from 'react'
import FadeIn from 'react-fade-in'
import { useDispatch } from 'react-redux'
import { useForm } from 'react-hook-form'
import { useMutation } from '@apollo/react-hooks'
import Router from 'next/router'

import { FormErrorMessage } from 'components/Message'
import { LOGIN_QUERY } from 'lib/graphql/account'
import useAuth from 'hooks/useAuth'
import { setError, setSuccess } from 'lib/redux/actions'

type Inputs = {
  email: string
  password: string
}

const Login: FC = () => {
  const { register, handleSubmit, errors } = useForm<Inputs>()
  const dispatch = useDispatch()

  const { login } = useAuth()

  const [generateCustomerToken, { loading }] = useMutation(LOGIN_QUERY, {
    update(cache, { data }) {
      /**
       * UPDATE THE CACHE AFTER GETTING NEW RESPONSE FROM THE QUERY
       */
      cache.writeQuery({
        query: LOGIN_QUERY,
        data,
      })
    },
  })

  const onSubmit = async ({ email, password }: Inputs) => {
    try {
      const { data } = await generateCustomerToken({
        variables: { email, password },
      })

      const token = data.generateCustomerToken.token

      if (!!token) {
        login(token)
        dispatch(setSuccess('Logged In Successfully!!', 'login'))
        Router.push('/')
      }
    } catch (error) {
      dispatch(setError(error?.graphQLErrors[0].message, 'login'))
    }
  }

  return (
    <FadeIn>
      <form className="form-row mt-5" onSubmit={handleSubmit(onSubmit)}>
        <fieldset className="col-lg-6 col-12">
          <div className="form-group">
            <label htmlFor="email">Email address</label>
            <input
              type="email"
              id="email"
              name="email"
              className="form-control"
              placeholder="Enter email"
              ref={register({
                required: 'Please enter your email address',
                pattern: /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
              })}
            />
            <FormErrorMessage name="email" errors={errors} />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              name="password"
              id="password"
              className="form-control"
              placeholder="Password"
              ref={register({ required: 'Please enter your password' })}
            />
            <FormErrorMessage name="password" errors={errors} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            Submit
          </button>
        </fieldset>
      </form>
    </FadeIn>
  )
}

export default Login
