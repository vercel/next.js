const BuildId = () => {
  return <p id="buildId">{process.env.CONFIG_BUILD_ID}</p>
}

export default BuildId
