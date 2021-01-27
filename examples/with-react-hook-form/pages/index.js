import { useState } from 'react'
import { useForm } from 'react-hook-form'

const IndexPage = () => {
  const [user, setUser] = useState()
  const { register, errors, handleSubmit } = useForm()
  const login = handleSubmit(({ username, password, remember }) => {
    // You should handle login logic with username, password and remember form data
    setUser({ name: username })
  })

  return (
    <div className="container">
      {user ? (
        <span className="hello-user">Hello, {user.name}!</span>
      ) : (
        <form onSubmit={login}>
          <div className="row">
            <h3 className="form-header">LOGIN</h3>
          </div>
          <div className="row">
            <input
              type="text"
              name="username"
              placeholder="user name"
              ref={register({
                required: { value: true, message: 'User name is required' },
                minLength: {
                  value: 3,
                  message: 'User name cannot be less than 3 character',
                },
              })}
              className={'form-field' + (errors.username ? ' has-error' : '')}
            />
            {errors.username && (
              <span className="error-label">{errors.username.message}</span>
            )}
          </div>
          <div className="row">
            <input
              type="password"
              name="password"
              placeholder="password"
              ref={register({
                required: {
                  value: true,
                  message: 'Please enter your password',
                },
              })}
              className={'form-field' + (errors.password ? ' has-error' : '')}
            />
            {errors.password && (
              <span className="error-label">{errors.password.message}</span>
            )}
          </div>
          <div className="row row-remember">
            <input
              type="checkbox"
              name="remember"
              id="remember"
              ref={register}
            />
            <label htmlFor="remember" className="remember-label">
              Remember me
            </label>
          </div>
          <div className="row">
            <button type="submit" className="btn login-btn">
              Login
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

export default IndexPage
