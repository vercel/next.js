// API route example for handling 410 Gone status

// List of deleted posts
const DELETED_POSTS = ["deleted"];

// List of known posts
const KNOWN_POSTS = ["active", "deleted"];

export default function handler(req, res) {
  const { slug } = req.query;

  // Check if post is deleted
  if (DELETED_POSTS.includes(slug)) {
    // Return 410 Gone for deleted content
    res.status(410).json({
      error: "Gone",
      message: "This post has been permanently removed",
    });
    return;
  }

  // Check if post exists
  if (!KNOWN_POSTS.includes(slug)) {
    // Return 404 Not Found for unknown content
    res.status(404).json({
      error: "Not Found",
      message: "Post not found",
    });
    return;
  }

  // Return data for active post
  res.status(200).json({
    slug,
    title: `Post ${slug}`,
    content: "This is the content of an active post.",
  });
}
