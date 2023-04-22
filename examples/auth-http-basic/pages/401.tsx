import React from "react";
import { GetServerSideProps } from "next";

const P401: React.FC = () => null;

export const getServerSideProps: GetServerSideProps = async (context) => {
  context.res.setHeader("Content-Type", "text/plain");
  context.res.statusCode = 401;
  context.res.write("401 Unauthorised");
  context.res.end();

  return {
    props: {},
  };
};

export default P401;
