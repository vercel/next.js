// The same stylesheet the layout imports. A page always renders inside its
// layout, so the layout should be the only entry tracking it.
import './shared.css'

export default function Page() {
  return <p className="shared-css-marker">hello</p>
}
