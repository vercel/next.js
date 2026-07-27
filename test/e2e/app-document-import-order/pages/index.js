import sideEffect from '../sideEffectModule'
import RequiredByPage from '../requiredByPage'

const sideEffects = sideEffect('page')

function Hi() {
  return (
    <div>
      <RequiredByPage />
      <p>Hello world!</p>
      {sideEffects.map((arg, index) => (
        <p key={arg} className="side-effect-calls">
          {arg}
        </p>
      ))}
    </div>
  )
}

Hi.getInitialProps = () => ({})

export default Hi
