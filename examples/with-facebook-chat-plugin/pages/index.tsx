import { NextPage } from 'next/types'

const Home: NextPage = () => {
  return (
    <div>
      <h1>
        Add `NEXT_PUBLIC_FACEBOOK_PAGE_ID` to `.env.local` in order for the
        chat plugin to show up.
      </h1>
    </div>
  )
}

export default Home
