import { all, fork } from 'redux-saga/effects'
import { watchSearchAddress } from './search/sagas'

// const query = `
// {
//   properties
//     {
//         baths,
//         beds,
//         landSize,
//         floorSize,
//         address {
//           streetType,
//           formattedAddress,
//           postCode,
//           suburb
//         }
//     }
// }`

function* rootSaga() {
  yield all([fork(watchSearchAddress)])
}

export default rootSaga
