import { useForm } from 'react-hook-form'

const Login = () => {
  const { register, errors, handleSubmit } = useForm()
  const login = handleSubmit(({ username, password, remember }) => {
    console.log(
      `username:${username}, password:${password}, remember:${remember}`
    )
    // Handle login logic with username, password and remember form data
  })

  return (
    <form onSubmit={login}>
      <div>
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
          <span className="error">{errors.username.message}</span>
        )}
      </div>
      <div>
        <input
          type="password"
          name="password"
          placeholder="password"
          ref={register({
            required: { value: true, message: 'Please enter your password' },
          })}
          className={'form-field' + (errors.password ? ' has-error' : '')}
        />
        {errors.password && (
          <span className="error">{errors.password.message}</span>
        )}
      </div>
      <div>
        <input type="checkbox" name="remember" id="remember" ref={register} />
        <label htmlFor="remember">Remember me</label>
      </div>
      <div>
        <button type="submit">Login</button>
      </div>
    </form>
  )
}

export default Login
