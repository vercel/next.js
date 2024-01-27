import * as React from "react";
import SingleImage from "../../components/SingleImage";
import { images } from "../../constants";
const Page = ({ index }) => {
  return <SingleImage index={index} />;
};

export async function getStaticProps({ params }) {
  const number = Number.parseInt(params.index, 10);
  return {
    props: {
      index: number,
    },
  };
}

export async function getStaticPaths() {
  return {
    paths: images.map((_id, index) => {
      return {
        params: {
          index: `${index}`,
        },
      };
    }),
    fallback: false,
  };
}

export default Page;
