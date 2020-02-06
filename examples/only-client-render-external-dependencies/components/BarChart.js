import dynamic from 'next/dynamic'

export default dynamic({
  modules: () => ({
    BarChart: import('recharts').then(({ BarChart }) => BarChart),
    Bar: import('recharts').then(({ Bar }) => Bar),
  }),
  render: (props, { BarChart, Bar }) => (
    <BarChart width={props.width} height={props.height} data={props.data}>
      <Bar dataKey="uv" fill="#8884d8" />
    </BarChart>
  ),
})
