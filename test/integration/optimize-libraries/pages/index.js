import moment from 'moment'
window.moment = moment
export default () => <h1>Current time: {moment().format('LLL')}</h1>
