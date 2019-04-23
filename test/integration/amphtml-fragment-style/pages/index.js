import { withAmp } from 'next/amp'

export default withAmp(() => (
  <div>
    <p>Hello world!</p>
    <style jsx>{`
      p {
        font-size: 16.4px;
      }
    `}</style>
  </div>
))
