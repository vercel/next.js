export default async (req, res) => {
	// Clears the preview mode cookies.
	// This function accepts no arguments.
	res.clearPreviewData()

	// Redirect to the slug
	res.writeHead(307, { Location: req.query.slug })
	res.end()
}