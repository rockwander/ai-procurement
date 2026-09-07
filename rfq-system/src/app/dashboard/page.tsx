'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { Card, Spinner } from '@/components/ui';
import { api } from '@/lib/fetcher';

export default function DashboardPage() {
  const [stats, setStats] = useState<{
    rfqs: number;
    suppliers: number;
    pendingQuotes: number;
    orders: number;
  } | null>(null);

  useEffect(() => {
    Promise.all([
      api<{ rfqs: any[] }>('/api/rfqs'),
      api<{ suppliers: any[] }>('/api/suppliers'),
      api<{ orders: any[] }>('/api/orders'),
    ])
      .then(([r, s, o]) => {
        const pending = r.rfqs.reduce(
          (acc, x) => acc + (Number(x.invitationCount) - Number(x.submittedCount)),
          0
        );
        setStats({
          rfqs: r.rfqs.length,
          suppliers: s.suppliers.length,
          pendingQuotes: pending,
          orders: o.orders.length,
        });
      })
      .catch(() => setStats({ rfqs: 0, suppliers: 0, pendingQuotes: 0, orders: 0 }));
  }, []);

  return (
    <AppShell>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      {!stats ? (
        <Spinner label="Loading…" />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Stat label="RFQs" value={stats.rfqs} href="/dashboard/rfqs" />
          <Stat label="Suppliers" value={stats.suppliers} href="/dashboard/suppliers" />
          <Stat label="Pending quotes" value={stats.pendingQuotes} href="/dashboard/rfqs" />
          <Stat label="Purchase orders" value={stats.orders} href="/dashboard/orders" />
        </div>
      )}

      <Card className="p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Get started</h2>
        <div className="grid md:grid-cols-3 gap-4 text-sm">
          <Step n={1} title="Create an RFQ" body="Describe the need; the drafting agent writes the RFQ and quote form." />
          <Step n={2} title="Invite suppliers" body="Run the pre-filtering agent, review the ranked list, send the RFQ by email." />
          <Step n={3} title="Compare & award" body="Suppliers fill the form; apply a strategy in plain English and send POs." />
        </div>
        <div className="mt-5">
          <Link
            href="/dashboard/rfqs/new"
            className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
          >
            + Create RFQ
          </Link>
        </div>
      </Card>
    </AppShell>
  );
}

function Stat({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href}>
      <Card className="p-5 hover:shadow-md transition-shadow">
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
      </Card>
    </Link>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div>
      <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold mb-2">
        {n}
      </div>
      <p className="font-medium text-gray-900">{title}</p>
      <p className="text-gray-500">{body}</p>
    </div>
  );
}
