import { EditorContextHelper } from '@magnolia/react-editor';

export const NEXT_PUBLIC_MGNL_HOST = `${process.env.NEXT_PUBLIC_MGNL_HOST}/magnoliaAuthor`;
export const languages = 'en de'.split(' ');
export const nodeName = process.env.NEXT_APP_MGNL_SITE_PATH;

export const templateAnnotationsApi = `${NEXT_PUBLIC_MGNL_HOST}/.rest/template-annotations/v1`;
export const pagesApi = `${NEXT_PUBLIC_MGNL_HOST}/.rest/delivery/pages/v1`;
export const pagenavApi = `${NEXT_PUBLIC_MGNL_HOST}/.rest/delivery/pagenav/v1`;

export async function getProps(resolvedUrl) {
	const magnoliaContext = EditorContextHelper.getMagnoliaContext(
		resolvedUrl,
		nodeName,
		languages
	);
	//
	let props = {
		nodeName,
		magnoliaContext,
	};
	// Fetching page content
	console.log(
		'Fetching page content from: ' +
			pagesApi +
			magnoliaContext.nodePath +
			magnoliaContext.search
	);
	const pagesRes = await fetch(
		pagesApi + magnoliaContext.nodePath + magnoliaContext.search
	);

	props.page = await pagesRes.json();
	// Fetching page navigation
	const pagenavRes = await fetch(pagenavApi + nodeName);
	props.pagenav = await pagenavRes.json();
	// Fetch template annotations only inside Magnolia WYSIWYG
	if (magnoliaContext.isMagnolia) {
		const templateAnnotationsRes = await fetch(
			templateAnnotationsApi + magnoliaContext.nodePath
		);
		props.templateAnnotations = await templateAnnotationsRes.json();
	}

	global.mgnlInPageEditor = magnoliaContext.isMagnoliaEdit;

	return {
		props,
	};
}
