import Image from 'next/image'
import logo from './nextjs.png'

function ImagePage(props) {
  return (
    <>
      <h1>next/image example</h1>
      <Image src={logo} placeholder="blur" />
    </>
  )
}

// we add getServerSideProps to prevent static optimization
// to allow us to compare server-side changes
export const getServerSideProps = () => {
  return {
    props: {},
  }
}

export default ImagePage
