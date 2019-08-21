import moment from 'moment'
if (typeof window !== 'undefined') {
  window.moment = moment
}
export default () => <h1>Current time: {moment().format('LLL')}</h1>
