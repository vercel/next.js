import React, { useContext } from 'react'
import { InjectStoreContext, StoreContext } from '../store'

const MyMobxApp = ({ Component }) => {
  const store = useContext(StoreContext)
  return (
    <InjectStoreContext initialData={store}>
      <Component />
    </InjectStoreContext>
  )
}

export default MyMobxApp
