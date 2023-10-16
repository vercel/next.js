import { Client, Counter } from './client'

export default function Page() {
  const secret = 'password'
  const secretInfo = (
    <div style={{ color: 'red' }}>
      My password is <marquee>qwerty</marquee>
    </div>
  )
  const counter = (
    <div>
      <Counter initial={999} />
    </div>
  )

  return (
    <div>
      <h2>Different keys for different actions</h2>
      <form
        action={async (formData) => {
          'use server'
          console.log('log ' + secret + ':' + formData.get('data'))
        }}
      >
        <input type="text" name="data" defaultValue="data" />
        <button type="submit">Log</button>
      </form>
      <br />
      <form
        action={async (formData) => {
          'use server'
          console.log('log ' + secret + ':' + formData.get('data'))
        }}
      >
        <input type="text" name="data" defaultValue="data" />
        <button type="submit">Log (alt)</button>
      </form>
      <h2>Flight encoding/decoding</h2>
      <Client
        loadUserInfo={async (username) => {
          'use server'

          if (username === 'Shu') {
            return secretInfo
          }

          return <div>Wrong username</div>
        }}
      />
      <h2>Client reference</h2>
      <Client
        loadUserInfo={async (username) => {
          'use server'

          console.log(counter.props)

          if (username === 'Shu') {
            // return (
            //   <div>
            //     <h3>This is a counter</h3>
            //     {counter}
            //   </div>
            // )
          }

          return <div>Wrong username</div>
        }}
      />
    </div>
  )
}
