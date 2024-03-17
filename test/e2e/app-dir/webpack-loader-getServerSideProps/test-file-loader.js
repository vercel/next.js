module.exports = function () {
  const options = this.getOptions()
  return `
  export default function Page({}) {
    return 'RENDERED_BY_LOADER'
  }
  export const getServerSideProps = async () => {
    return {
      props: {}
    }
  }`
}
