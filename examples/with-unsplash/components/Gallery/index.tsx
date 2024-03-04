import useSWR from "swr";
import fetcher from "libs/fetcher";
import styles from "./Gallery.module.css";
import UImage from "components/UImage";

interface GalleryProps {
  id_collection?: number;
}

const Gallery = ({ id_collection }: GalleryProps) => {
  const { data, error } = useSWR(
    "/api/photo" + (id_collection ? `/${id_collection}` : ""),
    fetcher,
  );

  if (error) return <div>failed to load</div>;

  if (!data) return <div>loading...</div>;

  return (
    <section className={styles.gallery_container}>
      {data.map(({ id, urls, alt_description, description }) => (
        <UImage
          id={id}
          urls={urls}
          altDescription={alt_description ? alt_description : description}
          key={`${id}_uimage_component`}
        />
      ))}
    </section>
  );
};

export default Gallery;
