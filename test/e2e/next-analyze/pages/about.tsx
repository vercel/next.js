import { fromSourceMap } from '../lib/source'

export default function About() {
  return <main>{fromSourceMap('about')}</main>
}
