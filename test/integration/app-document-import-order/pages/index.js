import sideEffect from '../sideEffectModule'

const sideEffects = sideEffect('page')

function Hi() {
  return (
    <div>
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
