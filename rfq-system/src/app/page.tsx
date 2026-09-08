'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The site root. For the POC (POC_AUTOLOGIN=1) it silently authenticates as the
 * seeded admin and drops the buyer on the dashboard — there is no landing page
 * and no login screen. If auto-login is off it just forwards to /login.
 */
export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      // Already signed in?
      const me = await fetch('/api/auth/me');
      if (me.ok) {
        router.replace('/dashboard');
        return;
      }
      // Try POC auto-login.
      const auto = await fetch('/api/auth/dev-login', { method: 'POST' });
      if (auto.ok) {
        router.replace('/dashboard');
        return;
      }
      router.replace('/login');
    })();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center text-gray-500">
      Signing you in…
    </div>
  );
}
