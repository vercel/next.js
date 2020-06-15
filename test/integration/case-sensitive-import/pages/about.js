import Head from 'next/head'
import MyComponent from '../components/mycomponent'

export default function () {
  return (
    <div>
      <Head>
        <title>about</title>
      </Head>
      about page
      <MyComponent />
    </div>
  )
}
