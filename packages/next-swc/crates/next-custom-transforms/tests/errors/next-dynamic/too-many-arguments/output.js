import dynamic from 'next/dynamic';
const DynamicComponentWithCustomLoading = dynamic(()=>import('../components/hello'), {
    loading: ()=><p>...</p>
}, '3rd');
