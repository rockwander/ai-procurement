'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { Card, StatusBadge, Spinner } from '@/components/ui';
import { api } from '@/lib/fetcher';

interface Order {
  id: string;
  poNumber: string;
  status: string;
  totalValue: number;
  currency: string;
  strategyUsed: string;
  createdAt: string;
  awards: Array<{ supplierName: string }>;
  rfqTitle: string;
  rfqId: string;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ orders: Order[] }>('/api/orders')
      .then((d) => setOrders(d.orders))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Purchase Orders</h1>

      {loading ? (
        <Spinner label="Loading orders…" />
      ) : orders.length === 0 ? (
        <Card className="p-8 text-center text-gray-500">
          No purchase orders yet. Award an RFQ to generate one.
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-4 py-3 font-medium">PO #</th>
                <th className="px-4 py-3 font-medium">RFQ</th>
                <th className="px-4 py-3 font-medium">Supplier</th>
                <th className="px-4 py-3 font-medium">Value</th>
                <th className="px-4 py-3 font-medium">Strategy</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">{o.poNumber}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/rfqs/${o.rfqId}`}
                      className="text-blue-600 hover:underline"
                    >
                      {o.rfqTitle}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {o.awards?.map((a) => a.supplierName).join(', ')}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    ${o.totalValue.toLocaleString()} {o.currency}
                  </td>
                  <td className="px-4 py-3 text-gray-500 max-w-xs truncate">
                    {o.strategyUsed}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(o.createdAt).toLocaleDateString()}
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
