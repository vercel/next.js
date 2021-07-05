export const config = { amp: true }

const SpecialChars = () => (
  <div data-amp-bind-text="fields_maxPrice_live < 801 ? '$' + round(fields_maxPrice_live) : '$800+'">
    $800+
  </div>
)

export default SpecialChars
