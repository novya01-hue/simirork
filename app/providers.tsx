'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { NeonAuthUIProvider } from '@neondatabase/auth-ui';

import { authClient } from '@/lib/auth/client';

export function Providers({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();

  return (
    <NeonAuthUIProvider
      authClient={authClient}
      navigate={router.push}
      replace={router.replace}
      onSessionChange={() => {
        router.refresh();
      }}
      redirectTo="/"
      Link={Link}
    >
      {children}
    </NeonAuthUIProvider>
  );
}