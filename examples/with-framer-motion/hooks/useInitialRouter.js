import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

export default function useInitialRouter() {
    const _router = useRouter();
    const [router, setRouter] = useState(null);
    useEffect(() => {
        setRouter(_router);
    }, []);
    return router;
}