import { spawn } from 'child_process'

export default function Page() {
  spawn('ls', ['-lh', '/usr'])
  return <div>ok</div>
}
