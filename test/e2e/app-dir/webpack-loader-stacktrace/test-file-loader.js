module.exports = function () {
  const options = this.getOptions()
  if (options.type === 'pages') {
    return `
    export default function Page({stack}) {
      return <main>{new Error().stack}</main>
    }
    export const getServerSideProps = async () => {
      return {
        props: {
          stack: new Error().stack,
        }
      }
    }`
  } else if (options.type === 'app-page') {
    return `
    export default function Page({}) {
      return <main>{new Error().stack}</main>
    }
    `
  } else if (options.type === 'app-route') {
    return `
    export function GET({}) {
      return new Response(new Error().stack)
    }
    `
  }
}
