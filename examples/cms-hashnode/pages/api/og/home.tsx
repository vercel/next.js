import { resizeImage } from '../../../utils/image'
import { ImageResponse } from '@vercel/og'
import { type NextRequest } from 'next/server'
import { DEFAULT_AVATAR } from '../../../utils/const'

export const config = {
  runtime: 'edge',
}

const fontRegular = fetch(
  new URL('../../../assets/PlusJakartaSans-Regular.ttf', import.meta.url)
).then((res) => res.arrayBuffer())

const fontMedium = fetch(
  new URL('../../../assets/PlusJakartaSans-Medium.ttf', import.meta.url)
).then((res) => res.arrayBuffer())

const fontSemiBold = fetch(
  new URL('../../../assets/PlusJakartaSans-SemiBold.ttf', import.meta.url)
).then((res) => res.arrayBuffer())

const fontBold = fetch(
  new URL('../../../assets/PlusJakartaSans-Bold.ttf', import.meta.url)
).then((res) => res.arrayBuffer())

const fontExtraBold = fetch(
  new URL('../../../assets/PlusJakartaSans-ExtraBold.ttf', import.meta.url)
).then((res) => res.arrayBuffer())

const kFormatter = (num: number) => {
  return num > 999 ? `${(num / 1000).toFixed(1)}K` : num
}

export default async function handler(req: NextRequest) {
  const [
    fontDataRegular,
    fontDataMedium,
    fontDataSemiBold,
    fontDataBold,
    fontDataExtraBold,
  ] = await Promise.all([
    fontRegular,
    fontMedium,
    fontSemiBold,
    fontBold,
    fontExtraBold,
  ])

  const { searchParams } = new URL(req.url)

  const ogData = JSON.parse(atob(searchParams.get('og') as string))
  const {
    title: encodedTitle,
    photo: userPhoto,
    logo,
    isTeam,
    domain,
    meta: encodedMeta,
    followers,
    articles,
    favicon,
  } = ogData

  const title = decodeURIComponent(encodedTitle)

  let meta
  if (encodedMeta) {
    meta = decodeURIComponent(encodedMeta)
  }

  const bannerBackground = '#f1f5f9'
  const photo = userPhoto || DEFAULT_AVATAR

  return new ImageResponse(
    (
      <div
        style={{
          fontFamily: '"Plus Jakarta Sans"',
        }}
        tw={`relative flex h-full w-full p-8 bg-white`}
      >
        {/* PERSONAL BLOG The following parent div is for personal blogs */}
        {/* if the site is set to open in dark mode by default, change text-black to text-white and bg-white to bg-black */}
        {!isTeam && (
          <div
            tw={`flex w-full flex-col items-center justify-center text-black h-full p-10 bg-[${bannerBackground}] relative rounded-xl`}
          >
            <div tw="absolute -top-px -left-px -right-px -bottom-px rounded-xl border-2 border-black/5" />
            <div
              tw="mx-auto flex flex-row items-center"
              style={{ width: '90%' }}
            >
              <div tw="mr-20 flex h-56 w-56 overflow-hidden rounded-full">
                <img
                  tw="w-full"
                  alt="name"
                  src={resizeImage(photo, { w: 400, h: 400, c: 'face' })}
                />
              </div>
              <div tw="flex flex-1 flex-col items-start">
                {/* Either show the Site title below or Site logo depending on whether a blog has a logo or not */}

                {/* Site title */}
                {!logo && title && <p tw="m-0 text-5xl font-bold">{title}</p>}

                {/* Site Logo - load dark logo only if the site is set to open in dark mode */}
                {logo ? (
                  <img
                    tw="block w-3/4"
                    alt="name"
                    src={resizeImage(logo, { w: 1000, h: 250, c: 'thumb' })}
                  />
                ) : null}

                {/* Show domain name */}
                <p tw="m-0 my-5 text-2xl font-semibold opacity-75">{domain}</p>

                {/* If blog's about me is not available hide this p tag */}
                {meta && (
                  <p tw="m-0 mb-5 flex flex-row flex-wrap text-ellipsis break-words text-2xl opacity-75">
                    {meta}
                  </p>
                )}
                <div tw="flex flex-row items-center text-2xl opacity-75">
                  {/* If no of followers is zero hide this p tag */}
                  {followers > 0 && (
                    <p tw="m-0 mr-5 flex flex-row items-center">
                      <strong tw="mr-2">{kFormatter(followers)}</strong>
                      <span>follower{followers === 1 ? '' : 's'}</span>
                    </p>
                  )}
                  {/* If no of articles are zero, hide this p tag */}
                  {articles > 0 && (
                    <p tw="m-0 mr-5 flex flex-row items-center">
                      <strong tw="mr-2">{kFormatter(articles)}</strong>
                      <span>article{articles === 1 ? '' : 's'}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TEAM BLOG The following parent div is for team blogs */}
        {/* if the site is set to open in dark mode by default, change text-black to text-white and bg-white to bg-black */}
        {isTeam && (
          <div
            tw={`flex w-full flex-col items-center justify-center text-black h-full p-10 bg-[${bannerBackground}] relative rounded-xl`}
          >
            <div tw="absolute -top-px -left-px -right-px -bottom-px rounded-xl border-2 border-black/5" />
            <div
              tw="mx-auto flex flex-row items-center"
              style={{ width: '80%' }}
            >
              {/* Show the following if the team doesn't have a logo and has a thumbnail/favicon */}
              {!logo && favicon && (
                <div tw="mr-20 flex h-56 w-56 overflow-hidden rounded-full">
                  <img
                    tw="w-full"
                    alt="name"
                    src={`${favicon}?w=400&h=400&fit=crop&crop=faces&auto=compress`}
                  />
                </div>
              )}
              <div tw="flex flex-1 flex-col items-start">
                {/* Either show the Site title below or Site logo depending on whether a blog has a logo or not */}

                {/* Site title */}
                {!logo && title && <p tw="m-0 text-5xl font-bold">{title}</p>}

                {/* Site Logo */}
                {logo ? (
                  <img tw="mb-10 block w-1/2" alt="name" src={logo} />
                ) : null}

                {/* Show domain name */}
                <p tw="m-0 my-5 text-2xl font-semibold opacity-75">{domain}</p>

                {/* If blog's about me is not available hide this p tag */}
                {meta && (
                  <p tw="m-0 mb-5 flex flex-row flex-wrap text-ellipsis break-words text-2xl opacity-75">
                    {meta}
                  </p>
                )}
                <div tw="flex flex-row items-center text-2xl opacity-75">
                  {/* If no of followers is zero hide this p tag */}
                  {followers > 0 && (
                    <p tw="m-0 mr-5 flex flex-row items-center">
                      <strong tw="mr-2">{kFormatter(followers)}</strong>
                      <span>follower{followers === 1 ? '' : 's'}</span>
                    </p>
                  )}
                  {/* If no of articles are zero, hide this p tag */}
                  {articles > 0 && (
                    <p tw="m-0 mr-5 flex flex-row items-center">
                      <strong tw="mr-2">{kFormatter(articles)}</strong>
                      <span>article{articles === 1 ? '' : 's'}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: 'Typewriter',
          data: fontDataRegular,
          style: 'normal',
          weight: 400,
        },
        {
          name: 'Typewriter',
          data: fontDataMedium,
          style: 'normal',
          weight: 500,
        },
        {
          name: 'Typewriter',
          data: fontDataSemiBold,
          style: 'normal',
          weight: 600,
        },
        {
          name: 'Typewriter',
          data: fontDataBold,
          style: 'normal',
          weight: 700,
        },
        {
          name: 'Typewriter',
          data: fontDataExtraBold,
          style: 'normal',
          weight: 800,
        },
      ],
    }
  )
}
