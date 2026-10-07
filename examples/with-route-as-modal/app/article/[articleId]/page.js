import Article from "../../../components/Article";
import { data } from "../../../components/Grid";
import ArticleModal from "./ArticleModal";

export default async function ArticlePage({ params }) {
  const { articleId } = await params;

  return (
    <ArticleModal>
      <Article id={articleId} pathname={`/article/${articleId}`} />
    </ArticleModal>
  );
}

export function generateStaticParams() {
  return data.map((articleId) => ({
    articleId: articleId.toString(),
  }));
}
