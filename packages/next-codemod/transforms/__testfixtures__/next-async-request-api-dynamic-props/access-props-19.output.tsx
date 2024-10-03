const Page = async props => {
  const params = await props.params;
  return (<div>{params.slug}</div>);
}

const generateMetadata = async props => {
  const params = await props.params;

  return ({
    title: params.slug
  });
}

export default Page
export { generateMetadata }
