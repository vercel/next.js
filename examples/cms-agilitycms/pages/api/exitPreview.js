export default async (req, res) => {
	// Clears the preview mode cookies.
	// This function accepts no arguments.
	res.clearPreviewData()

	// Redirect to the slug
	//Add a dummy querystring to the location header - since Netlify will keep the QS for the incoming request by default
	res.writeHead(307, { Location: `${req.query.slug}?preview=0` })
	res.end()
}