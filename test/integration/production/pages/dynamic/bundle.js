import dynamic from 'next/dynamic'

const HelloBundle = dynamic({
  modules: {
    Hello1: import('../../components/hello1'),
    Hello2: import('../../components/hello2')
  },
  render: (props, { Hello1, Hello2 }) => (
    <div>
      <h1>{props.title}</h1>
      <Hello1 />
      <Hello2 />
    </div>
  )
})

export default () => (
  <HelloBundle title="Dynamic Bundle"/>
)
