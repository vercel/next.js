import { Client } from '@notionhq/client';

const notion = new Client({
  auth: process.env.NOTION_API_TOKEN,
});

function toPages(response) {
  return response.results.map(page => ({
    id: page.id,
    date: page.properties['Date']['rich_text'][0].plain_text,
    author: {
      name: page.properties['Author']['people'][0].name,
      picture: {
        url: page.properties['Author']['people'][0].avatar_url,
      }
    },
    title: page.properties['Name']['title'][0].plain_text
  }));
}

function toPageBlocks(response) {
  return response.results.map(pageBlock => ({
    id: pageBlock.id,
    type: pageBlock.type,
    text: pageBlock?.[pageBlock.type]?.text?.[0]?.plain_text
  }));
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const response = await notion.databases.query({
        database_id: process.env.NOTION_DATABASE_ID,
        filter: {
            property: 'Category',
            multi_select: {
                contains: 'home',
            },
        },
    });

    const pages = toPages(response);
    const pagesBlocks = await Promise.all(
      pages.map(page => notion.blocks.children.list({
        block_id: page.id,
        page_size: 50,
      }))
    );

    const pagesWithBlocks = pages.map((page, pageIndex) => ({
      ...page,
      blocks: toPageBlocks(pagesBlocks[pageIndex])
    }))
    
    res.status(200).json({ posts: pagesWithBlocks });
    return;
  }
}