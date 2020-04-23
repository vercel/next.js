class Post {
  constructor(title) {
    this.title = title
  }

  toJSON() {
    return { title: this.title }
  }
}

export async function getServerSideProps() {
  return {
    props: { post: new Post('Post #1') },
  }
}

const Page = ({ post }) => {
  return <h1>{post.title}</h1>
}

export default Page
