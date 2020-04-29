import { useRouter } from "next/router";
import Articles from "../components/articles";
import Query from "../components/query";
import CATEGORY_ARTICLES_QUERY from "../apollo/queries/category/articles";

const Category = () => {
  const router = useRouter();

  return (
    <Query query={CATEGORY_ARTICLES_QUERY} id={router.query.id}>
      {({ data: { category } }) => {
        return (
          <div>
            <div className="uk-section">
              <div className="uk-container uk-container-large">
                <h1>{category.name}</h1>
                <Articles articles={category.articles} />
              </div>
            </div>
          </div>
        );
      }}
    </Query>
  );
};

export default Category;
