// pages/index.js
import getConfig from 'next/config'
const config = getConfig()

export default () => <div>
  <p id='server-only'>{config.mySecret}</p>
  <p id='server-and-client'>{config.public.staticFolder}</p>
</div>
