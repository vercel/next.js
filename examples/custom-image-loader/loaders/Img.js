import Image from 'next/image'
import loader from './imgloader'

export const Img = ({...props}) => {
    return <Image {...props} loader={loader}  alt={props?.alt} />
}

 