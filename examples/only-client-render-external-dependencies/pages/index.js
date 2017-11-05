import React from 'react'
import Link from 'next/link'
let LineChart
let Line

class Index extends React.Component {
  constructor () {
    super();
    this.state = {
      chart: false,
      data: [
        {name: 'Page A', uv: 1000, pv: 2400, amt: 2400},
        {name: 'Page B', uv: 3000, pv: 1398, amt: 2210},
        {name: 'Page C', uv: 2000, pv: 9800, amt: 2290},
        {name: 'Page D', uv: 2780, pv: 3908, amt: 2000},
        {name: 'Page E', uv: 1890, pv: 4800, amt: 2181},
        {name: 'Page F', uv: 2390, pv: 3800, amt: 2500},
        {name: 'Page G', uv: 3490, pv: 4300, amt: 2100},
      ]
    }
  }

  componentDidMount() {
    LineChart = require('recharts').LineChart;
    Line = require('recharts').Line;
    
    this.setState({
      chart: true
    })
  }

  render () {
    return (
      <div>
        <h1>Chart</h1>
        <Link href='/chart'><a>Go to another chart</a></Link>
        {this.state.chart == true &&
          <LineChart width={400} height={400} data={this.state.data}>
            <Line type="monotone" dataKey="uv" stroke="#8884d8" />
          </LineChart>
        }
      </div>
    )
  }
}

export default Index