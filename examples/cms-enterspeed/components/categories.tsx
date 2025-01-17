type Props = {
  categories: string[];
};

export default function Categories({ categories }: Props) {
  return (
    <span className="ml-1">
      under
      {categories.length > 0 ? (
        categories.map((category, index) => (
          <span key={index} className="ml-1">
            {category}
          </span>
        ))
      ) : (
        <span className="ml-1">{categories}</span>
      )}
    </span>
  );
}
