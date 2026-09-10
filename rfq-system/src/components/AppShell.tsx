'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/fetcher';

/** Wraps buyer pages: enforces auth, renders header + nav. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const d = await api<{ user: { name: string } }>('/api/auth/me');
        setName(d.user.name);
        setReady(true);
        return;
      } catch {
        // No session — try POC auto-login before bouncing to /login.
        const auto = await fetch('/api/auth/dev-login', { method: 'POST' });
        if (auto.ok) {
          const d = await auto.json();
          setName(d.user?.name ?? '');
          setReady(true);
          return;
        }
        router.replace('/login');
      }
    })();
  }, [router]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    localStorage.removeItem('user');
    router.replace('/login');
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="font-bold text-gray-900">
              RFQ System
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/dashboard/rfqs" className="text-gray-600 hover:text-gray-900">
                RFQs
              </Link>
              <Link href="/dashboard/suppliers" className="text-gray-600 hover:text-gray-900">
                Suppliers
              </Link>
              <Link href="/dashboard/orders" className="text-gray-600 hover:text-gray-900">
                Purchase Orders
              </Link>
              <Link href="/dashboard/mailbox" className="text-gray-600 hover:text-gray-900">
                Supplier Mailbox
              </Link>
              <Link href="/dashboard/sample-docs" className="text-gray-600 hover:text-gray-900">
                Sample Docs
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-500">{name}</span>
            <button onClick={logout} className="text-gray-600 hover:text-gray-900">
              Logout
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
    </div>
  );
}
