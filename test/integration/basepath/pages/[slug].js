import { useRouter } from 'next/router'

export default () => <p id="slug">slug: {useRouter().query.slug}</p>
