'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Card, Badge, Spinner, Input, Button, ErrorText } from '@/components/ui';
import { api } from '@/lib/fetcher';

interface Supplier {
  id: string;
  companyName: string;
  contactEmail: string;
  contactPhone: string | null;
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
  const [editingId, setEditingId] = useState<string | null>(null);

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
        s.contactEmail.toLowerCase().includes(needle) ||
        (s.categories ?? []).some((c) => c.toLowerCase().includes(needle))
    );
  }, [suppliers, q]);

  function onSaved(updated: Supplier) {
    setSuppliers((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)));
    setEditingId(null);
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Suppliers</h1>
        <div className="w-64">
          <Input
            placeholder="Search name, email or category…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <Spinner label="Loading suppliers…" />
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {filtered.map((s) =>
            editingId === s.id ? (
              <SupplierEditCard
                key={s.id}
                supplier={s}
                onCancel={() => setEditingId(null)}
                onSaved={onSaved}
              />
            ) : (
              <Card key={s.id} className="p-4">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-semibold text-gray-900">{s.companyName}</span>
                  <Badge color="gray">★ {(s.rating ?? 0).toFixed(1)}</Badge>
                  <Badge color="gray">{s.pastOrdersCount ?? 0} orders</Badge>
                  {(s.flags ?? []).map((f) => (
                    <Badge key={f} color="red">
                      {f}
                    </Badge>
                  ))}
                  <button
                    onClick={() => setEditingId(s.id)}
                    className="ml-auto text-xs text-blue-600 hover:underline"
                  >
                    Edit
                  </button>
                </div>
                <p className="text-sm text-gray-600">{s.performanceSummary}</p>
                <p className="text-xs text-gray-400 mt-2">
                  {(s.categories ?? []).join(' · ')}
                </p>
                <p className="text-xs text-gray-400">{s.contactEmail}</p>
                {s.contactPhone && (
                  <p className="text-xs text-gray-400">{s.contactPhone}</p>
                )}
              </Card>
            )
          )}
        </div>
      )}
    </AppShell>
  );
}

function SupplierEditCard({
  supplier,
  onCancel,
  onSaved,
}: {
  supplier: Supplier;
  onCancel: () => void;
  onSaved: (s: Supplier) => void;
}) {
  const [companyName, setCompanyName] = useState(supplier.companyName);
  const [contactEmail, setContactEmail] = useState(supplier.contactEmail);
  const [contactPhone, setContactPhone] = useState(supplier.contactPhone ?? '');
  const [categories, setCategories] = useState((supplier.categories ?? []).join(', '));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setSaving(true);
    setError('');
    try {
      const res = await api<{ supplier: Supplier }>(`/api/suppliers/${supplier.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          companyName,
          contactEmail,
          contactPhone,
          categories: categories.split(',').map((c) => c.trim()).filter(Boolean),
        }),
      });
      onSaved(res.supplier);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-4 space-y-2 border-blue-200">
      {error && <ErrorText>{error}</ErrorText>}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Company name</label>
        <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Contact email</label>
        <Input
          type="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Contact phone</label>
        <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">
          Categories (comma-separated)
        </label>
        <Input value={categories} onChange={(e) => setCategories(e.target.value)} />
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button size="sm" variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
