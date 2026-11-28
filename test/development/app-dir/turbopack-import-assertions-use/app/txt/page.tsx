// `.txt` has no built-in rule, `turbopackModuleType` alone sets its module type
import text from '../../notes.txt' with { turbopackModuleType: 'raw' }

export default function Page() {
  return <p id="raw-txt">{text}</p>
}
