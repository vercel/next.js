export const config = { amp: true }

export default () => (
  <div data-amp-bind-text="fields_maxPrice_live < 801 ? '$' + round(fields_maxPrice_live) : '$800+'">
    $800+
  </div>
)
