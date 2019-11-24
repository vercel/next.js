import dynamic from 'next/dynamic'

export default dynamic({
  modules: () => ({
    LineChart: import('recharts').then(({ LineChart }) => LineChart),
    Line: import('recharts').then(({ Line }) => Line),
  }),
  render: (props, { LineChart, Line }) => (
    <LineChart width={props.width} height={props.height} data={props.data}>
      <Line type="monotone" dataKey="uv" stroke="#8884d8" />
    </LineChart>
  ),
})
