export default function AuthorCard({ author }) {
  return (
    <a>
      {author.first_name} {author.last_name}
    </a>
  );
}
