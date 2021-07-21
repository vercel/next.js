import { validatePreview, getDynamicPageURL } from '@agility/nextjs/node'

// A simple example for testing it manually from your browser.
// If this is located at pages/api/preview.js, then
// open /api/preview from your browser.
export default async (req, res) => {

	//validate our preview key, also validate the requested page to preview exists
	const validationResp = await validatePreview({
		agilityPreviewKey: req.query.agilitypreviewkey,
		slug: req.query.slug
	});

	if (validationResp.error) {
		return res.status(401).end(`${validationResp.message}`)
	}

	let previewUrl = req.query.slug;

	//TODO: these kinds of dynamic links should work by default (even outside of preview)
	if(req.query.ContentID) {
		const dynamicPath = await getDynamicPageURL({contentID: req.query.ContentID, preview: true, slug: req.query.slug});
		if(dynamicPath) {
			previewUrl = dynamicPath;
		}
	}

	//enable preview mode
	res.setPreviewData({})

	// Redirect to the slug
	res.writeHead(307, { Location: previewUrl })
	res.end()

}