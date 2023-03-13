import { AmpIncludeCustomElement } from './AmpCustomElement'

type AmpStateProps = {
  id?: string
  src?: string
  children?: React.ReactNode
}

const AmpState: React.FC<AmpStateProps> = ({ id, src, children }) => {
  return (
    <>
      <AmpIncludeCustomElement name="amp-bind" version="0.1" />
      <amp-state id={id} src={src}>
        {children && (
          <script
            type="application/json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(children),
            }}
          />
        )}
      </amp-state>
    </>
  )
}

export default AmpState
