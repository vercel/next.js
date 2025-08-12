import react from 'react'
import { MoreData } from '../../components/more-data'
import { DataContext } from '../../data-context'

const ValueItem = () => {
  const value = react.useContext(DataContext)
  return <p>{value}</p>
}

export default function Page(props) {
  return (
    <>
      <DataContext.Provider value={'hello context'}>
        <p>hello from pages/blog-ssr/[slug]</p>
        <ValueItem />
        <MoreData />
      </DataContext.Provider>
    </>
  )
}

export function getServerSideProps() {
  return {
    props: {
      now: Date.now(),
    },
  }
}
