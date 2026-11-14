// The route group name is not part of the URL, but it is still a segment in
// the FlightRouterState, so it gets encoded into the segment cache key.
export default function Page() {
  return <h1 id="hello">hello from a route group</h1>
}
