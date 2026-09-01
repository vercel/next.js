// Required so /test-firstmod is a valid route too. The interesting
// case is /test-firstmod/inner/leaf — see the README... actually, see
// the layout's comment.
export default function Page() {
  return <p>test-firstmod root</p>
}
