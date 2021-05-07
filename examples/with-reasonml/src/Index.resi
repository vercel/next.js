type props
let default: props => React.element
let getServerSideProps: Next.GetServerSideProps.t<props, {.}, _>
