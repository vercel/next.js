import { spawn } from 'child_process'

export default function Page() {
  console.log(spawn('ls', ['-lh', '/usr']))
  return <div>ok</div>
}
