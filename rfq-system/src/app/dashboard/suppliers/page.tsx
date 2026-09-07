'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Card, Badge, Spinner, Input } from '@/components/ui';
import { api } from '@/lib/fetcher';

interface Supplier {
  id: string;
  companyName: string;
  contactEmail: string;
  categories: string[];
  rating: number;
  performanceSummary: string | null;
  pastOrdersCount: number;
  flags: string[] | null;
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    api<{ suppliers: Supplier[] }>('/api/suppliers')
      .then((d) => setSuppliers(d.suppliers))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const needle = q.toLowerCase();
    return suppliers.filter(
      (s) =>
        !needle ||
        s.companyName.toLowerCase().includes(needle) ||
        (s.categories ?? []).some((c) => c.toLowerCase().includes(needle))
    );
  }, [suppliers, q]);

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Suppliers</h1>
        <div className="w-64">
          <Input
            placeholder="Search name or category…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <Spinner label="Loading suppliers…" />
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {filtered.map((s) => (
            <Card key={s.id} className="p-4">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-semibold text-gray-900">
                  {s.companyName}
                </span>
                <Badge color="gray">★ {(s.rating ?? 0).toFixed(1)}</Badge>
                <Badge color="gray">{s.pastOrdersCount ?? 0} orders</Badge>
                {(s.flags ?? []).map((f) => (
                  <Badge key={f} color="red">
                    {f}
                  </Badge>
                ))}
              </div>
              <p className="text-sm text-gray-600">{s.performanceSummary}</p>
              <p className="text-xs text-gray-400 mt-2">
                {(s.categories ?? []).join(' · ')}
              </p>
              <p className="text-xs text-gray-400">{s.contactEmail}</p>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
