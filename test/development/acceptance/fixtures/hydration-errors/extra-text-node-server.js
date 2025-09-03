// extra-text-node-server
const isClient = typeof window !== 'undefined'
export default function Mismatch() {
  return <div className="parent">{!isClient && "only"}</div>;
}