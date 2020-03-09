import client from './sanity'

async function getRefs(items) {
  for (const item of Array.isArray(items) ? items : [items]) {
    for (const key of Object.keys(item || {})) {
      if (item[key] && typeof item[key] === 'object') {
        const { _ref, _type } = item[key]

        if (_type === 'reference') {
          item[key] = await client.getDocument(_ref)
          item[key] = await getRefs(item[key])
        }
        if (_type === 'image') {
          item[key] = await client.assets.getImageUrl(item[key].asset._ref)
        }
        if (_type === 'slug') {
          item[key] = (item[key].current || '').replace(/^\//, '')
        }
      }
    }
  }
  return items
}

export async function getPreviewPostBySlug(slug) {
  const data = await client.fetch(`*[_type == "post" && slug == ${slug}]`)
  console.log('got data', data)
  return data?.post
}

export async function getAllPostsWithSlug() {
  const data = await client.fetch()
  console.log(data)
  return data?.allPosts
}

export async function getAllPostsForHome(preview) {
  const data = await client.fetch(`*[_type == "post"]`)
  return getRefs(data)
}

export async function getPostAndMorePosts(slug, preview) {
  const data = client.fetch()
  return data
}
