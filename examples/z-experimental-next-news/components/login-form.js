export default () => (
  <div>
    <h4>Login</h4>
    <p>
      username: <input type='text' />
      <br />
      password: <input type='password' />
    </p>
    <button>login</button>
    <p>
      <a href='#'>Forgot your password?</a>
    </p>
    <h4>Create Account</h4>
    <p>
      username: <input type='text' />
      <br />
      password: <input type='password' />
    </p>
    <button>create account</button>

    <style jsx>{`
      p {
        line-height: 22px;
      }
    `}</style>
  </div>
)
