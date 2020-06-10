import { useRouter } from 'next/router'

export default () => <p>parts: {useRouter().query.parts?.join('/')}</p>
