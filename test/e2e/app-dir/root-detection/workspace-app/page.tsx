// `shared/utils` is written to the workspace root, above the app directory, so
// this import only resolves when the workspace root is the inferred root.
import { message } from '../../shared/utils'

export default function Page() {
  return <p>{message}</p>
}
