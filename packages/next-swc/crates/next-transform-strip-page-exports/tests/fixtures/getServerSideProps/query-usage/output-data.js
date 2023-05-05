export async function getServerSideProps({ query }) {
  return {
    props: {
      prop: query.prop,
    },
  };
}
