import type { GetStaticProps, NextPage } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import Carousel from "../../components/Carousel";
import getResults from "../../utils/cachedImages";
import type { ImageProps } from "../../utils/types";

const Home: NextPage = ({ currentPhoto }: { currentPhoto: ImageProps }) => {
  const router = useRouter();
  const { photoId } = router.query;
  let index = Number(photoId);

  return (
    <>
      <Head>
        <title>Next.js Conf 2022 Photos</title>
        <meta property="og:image" content={currentPhoto.url} />
        <meta name="twitter:image" content={currentPhoto.url} />
      </Head>
      <main className="mx-auto max-w-[1960px] p-4">
        <Carousel currentPhoto={currentPhoto} index={index} />
      </main>
    </>
  );
};

export default Home;

export const getStaticProps: GetStaticProps = async (context) => {
  const images = await getResults();
  const currentPhoto = images.find(
    (img) => img.id === Number(context.params.photoId),
  );

  return {
    props: { currentPhoto },
  };
};

export async function getStaticPaths() {
  const images = await getResults();
  return {
    paths: images.map((_, i) => ({ params: { photoId: i.toString() } })),
    fallback: false,
  };
}
