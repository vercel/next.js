export default function IsNull({ value }) {
  if (value === null) {
    return <div className="was-null">Value Was Null</div>
  }

  return <div className="was-not-null">Value Was Not Null</div>
}
