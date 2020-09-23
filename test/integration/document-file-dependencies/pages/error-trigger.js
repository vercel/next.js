import style from '../css/index.module.css'

function ErrorTrigger() {
  return <div className={style.index}>error-trigger</div>
}

ErrorTrigger.getInitialProps = () => {
  throw new Error('Intentional Error')

  // eslint-disable-next-line no-unreachable
  return {}
}

export default ErrorTrigger
