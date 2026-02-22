'use client';

import { useEffect } from 'react';
import { setAuthToken } from '@/lib/api';

export default function ClientAuthInit() {
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      setAuthToken(token);
    }
  }, []);

  return null;
}
