import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

export default function useId() {
    const router = useRouter();
    const [id, setId] = useState(router.query.id);

    useEffect(() => {
        if (!router.query.id) return;
        setId(Number.parseInt(router.query.id, 10));
    }, [router])

    return id;
}