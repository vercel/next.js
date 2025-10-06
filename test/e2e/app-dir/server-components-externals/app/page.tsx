import { dir } from 'external-package'
import { dir as subDir } from 'external-package/subpath'

export default function Page() {
  return (
    <>
      <div id="directory">{dir}</div>
      <div id="subdirectory">{subDir}</div>
    </>
  )
}
