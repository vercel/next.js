export function normalizePosts(postsFromEdge4CH) {
  if (postsFromEdge4CH){      
  const posts = postsFromEdge4CH.map((p) => {                
    let imageUrl= p.contentAssets?.assets?.[0]?.urls? p.contentAssets?.assets?.[0]?.urls : null ;    
    if (imageUrl === null && p.contentAssets?.assets?.[0]?.assetToPublicLink?.results?.[0]?.relativeUrl && p.contentAssets?.assets?.[0]?.assetToPublicLink?.results?.[0]?.versionHash)
    {
      let relativeUrl = p.contentAssets?.assets?.[0]?.assetToPublicLink?.results?.[0]?.relativeUrl;
      let versionHash = p.contentAssets?.assets?.[0]?.assetToPublicLink?.results?.[0]?.versionHash;
      imageUrl = process.env.SITECORE_CONTENTHUB_PUBLIC_URL+'/api/public/content/'+relativeUrl+'?v='+versionHash;
    }
    else 
    {
      imageUrl = `https://dummyimage.com/1024x768/000/fff`;   // Default cover in case no image attached.                   
    }
       
    let normalizedPost = {
    title: p.articleTitle,
    id: p.articleId,
    excerpt: p.articleIntro? p.articleIntro : p.articleContent,
    date: p.articlePublicationDate,
    content: p.articleContent + p.articleAdditionalContent,
    ogImage: {
      url: imageUrl
    },
    coverImage: {
        url: imageUrl,
        width: 2000,
        height: 1000,
        aspectRatio: 100,
        alt: `Image for ${p.articleTitle}`,
        title: `Image for ${p.articleTitle}` ,
        bgColor: null,          
    },
    author: {
      name: `Sitecore Team`, //TODO p.articleAuthor article return only Email, so we need to fix the schema to get Author First name and last name. 
      picture: {
        url: `/images/sitecore-logo-icon.png`, //TODO Get Author name and picture with the graphql query from Content Hub
      },
    },
    promo: { // This example to show how you can relate article to some promo
      id: p.contentPromos?.promos?.[0]?.id || null,
      contentName : p.contentPromos?.promos?.[0]?.content_Name || null,
    },
  }    
  return normalizedPost
  })  
  return posts
  }
}