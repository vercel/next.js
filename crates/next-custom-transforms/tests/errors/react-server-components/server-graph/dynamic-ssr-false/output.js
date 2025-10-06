import dynamic from 'next/dynamic';
export default function() {
    return dynamic(()=>import('client-only'), {
        ssr: false
    });
}
