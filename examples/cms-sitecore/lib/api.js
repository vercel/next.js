import { normalizePosts } from './normalize';

export const GQL_FIELDS_ON_FINANCIAL =`
{    
  articleId : id
  articleTitle: _b004_Title
  articleIntro: _b004_Intro
  articleContent : _b004_Content
  articleAdditionalContent: _b004_AdditionalContent
  articlePublicationDate: content_PublicationDate
  articleAuthor: createdBy  
  contentAssets: cmpContentToMasterLinkedAsset {
    total
    assets: results {
      id
      urls              
    }    
  }
  contentPromos: reference_3b004_RelatedPromo_Parents {
    total
    promos: results {
      id
      content_Name                
    }
  }
}`;

export const GQL_FIELDS_ON_LIGHTHOUSE =`
{
  articleId : id
  articleTitle: _f4e3_Title
  articleIntro: _f4e3_Introduction
  articleContent : _f4e3_Content
  articleAdditionalContent: _f4e3_Additionalcontent
  articlePublicationDate: content_PublicationDate  
  articleAuthor: createdBy
  contentAssets: cmpContentToMasterLinkedAsset {
    total
    assets: results {
      id 
      assetToPublicLink{
        results{
          relativeUrl
          versionHash                      
        }
      }
    }
  }
}`;

async function fetchGraphQL(query, preview = true) {
  
  let edgeEndpoint = `${process.env.SITECORE_CONTENTHUB_PUBLIC_URL}/api/graphql/preview/v1`; // TODO Replace with Delivery env variables when content hub Delivery is enabled.  
  let apiToken = process.env.SITECORE_CONTENTHUB_PREVIEW_ACCESS_TOKEN //TODO Replace with Delivery env variables when content hub Delivery is enabled. 
  
  if (preview){
     edgeEndpoint = `${process.env.SITECORE_CONTENTHUB_PUBLIC_URL}/api/graphql/preview/v1`;
     apiToken = process.env.SITECORE_CONTENTHUB_PREVIEW_ACCESS_TOKEN
  }
  try{  
    return fetch(
      `${edgeEndpoint}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GQL-Token': `${apiToken}`,
        },
        body: JSON.stringify({ query }),
      }
    ).then((response) => response.json());
  }
  catch (error){
    console.log(error);
  }
  
}

export async function getAllPosts(preview) {
  const query = `
  {
    allM_ContentCollection(where: { contentCollectionName_eq: "${process.env.SITECORE_CONTENTHUB_CONTENTCOLLECTION_NAME}" }) {
      total
      results {
        contentCollection : contentCollectionToContent {
          total
          contentItems: results {
            id
            contentName: content_Name
            contentTypeToContent {
              id
            }
            ... on M_Content_4f4e3                      
            ${GQL_FIELDS_ON_LIGHTHOUSE}  
          }
        }
      }      
    }
  }`;    
  const entries = await fetchGraphQL(query, preview);    
  return AllPostEntries(entries);
}



// function FirstPostEntry(fetchResponse) {  
//   const data = fetchResponse?.data?.allM_ContentCollection?.results?.[0];
//   const normalizedPost = normalizePosts(data)  
//   return normalizedPost || null 
// }

function AllPostEntries(fetchResponse) {
  const data = fetchResponse?.data?.allM_ContentCollection?.results?.[0]?.contentCollection?.contentItems  
  const normalizedPosts = normalizePosts(data)    
  return normalizedPosts || null 
}

export async function getPostById(postId, preview) {
  const query = `
  query {
    m_Content_4f4e3(id: "${postId}")    
    ${GQL_FIELDS_ON_LIGHTHOUSE}    
  }`;     
  const entry = await fetchGraphQL(query, preview);      
  let post = new Array(entry.data?.m_Content_4f4e3);    
  let normalizedPost =  normalizePosts(post);  
  return normalizedPost || null ;
}

export async function getPostAndMorePosts(postId, preview) {  
  const entry = await getPostById(postId, preview); 
  const entries = await getAllPosts(preview);       
  
  return {
    post: entry,
    morePosts: entries,
  }
}

export async function getAllPostsIds(preview){
  const query = `
  {
    allM_ContentCollection(where: { contentCollectionName_eq: "${process.env.SITECORE_CONTENTHUB_CONTENTCOLLECTION_NAME}" }) {
      total
      results {
        contentCollection : contentCollectionToContent {
          total
          contentItems: results {
            id
            contentName: content_Name            
          }
        }
      }
    }
  }`   
  const entries = await fetchGraphQL(query, preview);  
  return entries?.results?.[0]?.contentItems;
}