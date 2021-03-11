import { GetStaticProps, GetStaticPaths } from "next";
import Link from "next/link";

import { User } from "../../interfaces";
import { sampleUserData } from "../../utils/sample-data";
import Layout from "../../components/Layout";
import ListDetail from "../../components/ListDetail";

type Props = {
  item?: User;
  errors?: string;
};

const StaticPropsDetail = ({ item, errors }: Props) => {
  if (errors) {
    return (
      <Layout title="Error">
        <p>
          <span style={{ color: "red" }}>Error:</span> {errors}
        </p>
      </Layout>
    );
  }
  return (
    <Layout title={`${item ? item.name : "User Detail"}`}>
      <div class="container w-full md:max-w-3xl mx-auto pt-20">
        <div class="w-full px-4 md:px-6 text-xl text-gray-800 justify-center items-center flex mb-5">
          <h1 class="font-bold text-gray-900 pt-6 pb-2 text-3xl md:text-4xl">
            {item && <ListDetail item={item} />}
          </h1>
        </div>
        <div class="w-full px-4 md:px-6 text-xl text-gray-800 justify-center items-center flex mb-5">
          <Link href="/users">
            <a class="inline-block text-gray-600 no-underline hover:text-black hover:text-underline py-2 px-4">
              Back to all Users
            </a>
          </Link>
        </div>
      </div>
    </Layout>
  );
};

export default StaticPropsDetail;

export const getStaticPaths: GetStaticPaths = async () => {
  // Get the paths we want to pre-render based on users
  const paths = sampleUserData.map((user) => ({
    params: { id: user.id.toString() },
  }));

  // We'll pre-render only these paths at build time.
  // { fallback: false } means other routes should 404.
  return { paths, fallback: false };
};

// This function gets called at build time on server-side.
// It won't be called on client-side, so you can even do
// direct database queries.
export const getStaticProps: GetStaticProps = async ({ params }) => {
  try {
    const id = params?.id;
    const item = sampleUserData.find((data) => data.id === Number(id));
    // By returning { props: item }, the StaticPropsDetail component
    // will receive `item` as a prop at build time
    return { props: { item } };
  } catch (err) {
    return { props: { errors: err.message } };
  }
};
