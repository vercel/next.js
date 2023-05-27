import { NextResponse, NextRequest } from 'next/server';
import { tursoClient } from '@/utils/tursoClient';
import { Framework } from '@/app/page';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const { name, language, url, stars } = Object.fromEntries(formData);

  // Create redirect url
  const addNewUrl = req.nextUrl.clone();
  addNewUrl.pathname = '/add-new';

  if (!name || !language || !url || !stars) {
    NextResponse.redirect(addNewUrl + '?error=Fill in all fields!', {
      status: 422,
    });
  }
  if (
    typeof name !== 'string' ||
    typeof language !== 'string' ||
    typeof url !== 'string' ||
    typeof stars !== 'string'
  ) {
    return NextResponse.redirect(addNewUrl + '?error=Wrong Types', {
      status: 422,
    });
  }
  const githubUrlRgx =
    /((?:https?:)?\/\/)?((?:www)\.)?((?:github\.com))(\/(?:[\w-]+))(\/(?:[\w-]+))(\/)?/gi;
  if (!githubUrlRgx.test(url)) {
    return NextResponse.redirect(
      addNewUrl + '?error=Provide a valid GitHub url!',
      { status: 302 }
    );
  }
  if (typeof parseInt(stars) !== 'number') {
    return NextResponse.redirect(
      addNewUrl + '?error=Enter a valid number for stars',
      { status: 302 }
    );
  }

  const frameworkExists = await getFramework(name as string, url as string);

  if (frameworkExists !== null) {
    return NextResponse.redirect(addNewUrl, { status: 302 });
  }

  const add = await tursoClient.execute({
    sql: 'insert into frameworks(name, language, url, stars) values(?, ?, ?, ?);',
    args: [name, language, url, stars],
  });

  return NextResponse.redirect(addNewUrl + '?message=Framework added!', {
    status: 302,
  });
}

/**
 * @description Gets framework from the database by filtering the name and url columns
 * @param name Name of the framework being fetched
 * @param url GitHub url of the framework being fetched
 * @returns {Promise<Framework|null>}
 */
async function getFramework(
  name: string,
  url: string
): Promise<Framework | null> {
  const response = await tursoClient.execute({
    sql: 'select * from frameworks where url = ? or name = ?',
    args: [url, name],
  });

  if (response.rows.length) {
    return response.rows[0] as unknown as Framework;
  }
  return null;
}
