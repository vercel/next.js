export const revalidateInSeconds = 5 * 60;
export const getStaticProps = async () => {
  return {
    props: {},
    revalidate: revalidateInSeconds,
  };
};
