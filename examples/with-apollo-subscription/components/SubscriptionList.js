// import { useQuery } from "@apollo/react-hooks";
import gql from "graphql-tag";
import ErrorMessage from "./ErrorMessage";
import { useEffect } from "react";
export const ALL_POSTS_QUERY = gql`
  query allPosts($first: Int!, $skip: Int!) {
    allPosts(orderBy: createdAt_DESC, first: $first, skip: $skip) {
      id
      title
      votes
      url
      createdAt
    }
  }
`;

export const allPostsQueryVars = {
  skip: 0,
  first: 10
};

export default function SubscriptionList(props) {
  useEffect(() => {
    props.handleSubscribe();
  }, []);

  const { loading, error, data, fetchMore, networkStatus } = props;

  if (error) return <ErrorMessage message="Error loading posts." />;
  if (loading) return <div>Loading</div>;

  const { allPosts } = data;
  return (
    <section>
      <ul>
        {allPosts.map((post, index) => (
          <li key={post.id + index}>
            <div>
              <span>{index + 1}. </span>
              <a href={post.url}>{post.title}</a>
              {/* <PostUpvoter id={post.id} votes={post.votes} /> */}
            </div>
          </li>
        ))}
      </ul>

      <style jsx>{`
        section {
          padding-bottom: 20px;
        }
        li {
          display: block;
          margin-bottom: 10px;
        }
        div {
          align-items: center;
          display: flex;
        }
        a {
          font-size: 14px;
          margin-right: 10px;
          text-decoration: none;
          padding-bottom: 0;
          border: 0;
        }
        span {
          font-size: 14px;
          margin-right: 5px;
        }
        ul {
          margin: 0;
          padding: 0;
        }
        button:before {
          align-self: center;
          border-style: solid;
          border-width: 6px 4px 0 4px;
          border-color: #ffffff transparent transparent transparent;
          content: "";
          height: 0;
          margin-right: 5px;
          width: 0;
        }
      `}</style>
    </section>
  );
}
