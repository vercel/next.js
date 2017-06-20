import { translate } from 'react-i18next'
export default translate(['common'])((props) => (<h1>{props.t('hello')}, {props.t('morning')}</h1>))
