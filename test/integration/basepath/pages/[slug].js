import { useRouter } from 'next/router'

export default () => <p>slug: {useRouter().query.slug}</p>
