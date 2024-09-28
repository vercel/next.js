import {
  cookies as myCookies,
  headers as myHeaders,
  draftMode as myDraftMode,
} from 'next/headers'

export const myFun = async (): Promise<any> => {
  const name = (await myCookies()).get('name')
}

export const myFun2 = async (): Promise<any> => {
  await myHeaders()
}

export const myFun3 = async (): Promise<any> => {
  await myDraftMode()
}
