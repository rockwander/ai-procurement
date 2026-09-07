'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { Button, Card, StatusBadge, Spinner } from '@/components/ui';
import { api } from '@/lib/fetcher';

interface RFQRow {
  id: string;
  title: string;
  status: string;
  deadline: string | null;
  createdAt: string;
  invitationCount: number;
  submittedCount: number;
}

export default function RFQListPage() {
  const [rows, setRows] = useState<RFQRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ rfqs: RFQRow[] }>('/api/rfqs')
      .then((d) => setRows(d.rfqs))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">RFQs</h1>
        <Link href="/dashboard/rfqs/new">
          <Button>+ Create RFQ</Button>
        </Link>
      </div>

      {loading ? (
        <Spinner label="Loading RFQs…" />
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-gray-500">
          No RFQs yet.{' '}
          <Link href="/dashboard/rfqs/new" className="text-blue-600 hover:underline">
            Create your first one
          </Link>
          .
        </Card>
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Suppliers</th>
                <th className="px-4 py-3 font-medium">Quotes</th>
                <th className="px-4 py-3 font-medium">Deadline</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{r.title}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.invitationCount}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {r.submittedCount}/{r.invitationCount}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {r.deadline ? new Date(r.deadline).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/rfqs/${r.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </AppShell>
  );
}
