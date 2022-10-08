import Comp from './styled-jsx'
import StyledComp from './styled-components'

export default function Page() {
  return (
    <div>
      <Comp />
      <StyledComp />
      <style jsx>{`
        .this-wont-be-transformed {
          color: purple;
        }
      `}</style>
    </div>
  )
}
