import AmpIncludeCustomElement from './AmpIncludeCustomElement'

export default function AmpAnalytics(props) {
  return (
    <>
      <AmpIncludeCustomElement name="amp-analytics" version="0.1" />
      <amp-analytics type={props.type}>
        {props.script && (
          <script
            type="application/json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(props.script),
            }}
          />
        )}
      </amp-analytics>
    </>
  )
}
