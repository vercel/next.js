import { useState } from 'react'
import { useVisitorData } from '@fingerprintjs/fingerprintjs-pro-react'
import VisitorDataPresenter from '../../components/VisitorDataPresenter'

function SignInPage() {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [tag, setTag] = useState('')

  const [ignoreCache, setIgnoreCache] = useState(false)
  const [extendedResult, setExtendedResult] = useState(false)

  const { getData, data, isLoading, error } = useVisitorData(
    { extendedResult, tag, linkedId: login },
    { immediate: false }
  )

  return (
    <section className="body">
      <h3>Sign in</h3>
      <div>
        <p>
          Another common use-case is when you want to only fingerprint a user
          after they perform some action, in this case - submit a form. For this
          purpose <code>useVisitorData</code> hook should be called with{' '}
          <code>immediate</code> flag set to <code>false</code> and call the{' '}
          <code>getData</code> function on form submission.
        </p>
        <p>
          Try submitting the form with any values and notice that a fingerprint
          will be calculated.
        </p>
      </div>
      <div className="form-control checkbox">
        <label htmlFor="ignore-cache">
          Ignore cache:
          <input
            id="ignore-cache"
            type="checkbox"
            checked={ignoreCache}
            onChange={(e) => setIgnoreCache(e.currentTarget.checked)}
          />
        </label>
      </div>
      <div className="form-control checkbox">
        <label htmlFor="extended-result">
          Extended result:
          <input
            id="extended-result"
            type="checkbox"
            checked={extendedResult}
            onChange={(e) => setExtendedResult(e.currentTarget.checked)}
          />
        </label>
        <sub>will be used as extended_result param for the request</sub>
      </div>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          getData({ ignoreCache }).then((data) => {
            if (data) {
              // do something with the visitor data
              // for example, append visitor data to the form data to send to your server
              console.log(data)
            }
          })
        }}
      >
        <div className="form-control">
          <label htmlFor="login">Login:</label>
          <input
            id="login"
            type="text"
            name="login"
            required
            autoComplete="off"
            value={login}
            onChange={(e) => setLogin(e.currentTarget.value)}
          />
          <sub>will be used as linked_id param for the request</sub>
        </div>
        <div className="form-control">
          <label htmlFor="password">Password:</label>
          <input
            id="password"
            type="password"
            name="password"
            required
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
          />
        </div>
        <div className="form-control">
          <label htmlFor="tag">Tag:</label>
          <input
            id="tag"
            type="text"
            name="tag"
            value={tag}
            onChange={(e) => setTag(e.currentTarget.value)}
          />
          <sub>will be used as tag param for the request</sub>
        </div>
        <button type="submit">Submit</button>
      </form>
      <VisitorDataPresenter data={data} isLoading={isLoading} error={error} />
    </section>
  )
}

export default SignInPage
