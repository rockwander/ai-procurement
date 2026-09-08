'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { SupplierPicker } from '@/components/SupplierPicker';
import { Button, Card, StatusBadge, Spinner, ErrorText, Badge } from '@/components/ui';
import { api } from '@/lib/fetcher';

interface Invitation {
  invitationId: string;
  supplierId: string;
  supplierName: string;
  status: string;
  remindersSent: number;
  submittedAt: string | null;
  totalAmount: number | null;
}

export default function RFQDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [rfq, setRfq] = useState<any>(null);
  const [lineItems, setLineItems] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadRfq = useCallback(async () => {
    const d = await api<{ rfq: any; lineItems: any[] }>(`/api/rfqs/${id}`);
    setRfq(d.rfq);
    setLineItems(d.lineItems);
  }, [id]);

  const loadQuotes = useCallback(async () => {
    const d = await api<{ quotes: Invitation[] }>(`/api/rfqs/${id}/quotes`);
    setInvitations(d.quotes);
  }, [id]);

  useEffect(() => {
    Promise.all([loadRfq(), loadQuotes()])
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [loadRfq, loadQuotes]);

  async function sendReminder(invitationId: string) {
    setRemindingId(invitationId);
    setError('');
    try {
      await api(`/api/invitations/${invitationId}/remind`, { method: 'POST' });
      await loadQuotes();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRemindingId(null);
    }
  }

  async function deleteRfq() {
    const submitted = invitations.filter((i) => i.status === 'submitted').length;
    const hint =
      submitted > 0
        ? `\n\nThis will also delete ${submitted} submitted quote${
            submitted > 1 ? 's' : ''
          } and any purchase order.`
        : invitations.length > 0
        ? `\n\nThis will also delete ${invitations.length} supplier invitation${
            invitations.length > 1 ? 's' : ''
          }.`
        : '';
    if (!confirm(`Delete "${rfq.title}"? This cannot be undone.${hint}`)) return;
    setDeleting(true);
    setError('');
    try {
      await api(`/api/rfqs/${id}`, { method: 'DELETE' });
      router.push('/dashboard/rfqs');
    } catch (e: any) {
      setError(e.message);
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <Spinner label="Loading RFQ…" />
      </AppShell>
    );
  }
  if (!rfq) {
    return (
      <AppShell>
        <ErrorText>{error || 'RFQ not found'}</ErrorText>
      </AppShell>
    );
  }

  const invitedIds = new Set<string>(invitations.map((i) => i.supplierId));
  const submittedCount = invitations.filter((i) => i.status === 'submitted').length;

  return (
    <AppShell>
      <div className="flex items-start justify-between mb-3 gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{rfq.title}</h1>
        <div className="flex items-center gap-3">
          <StatusBadge status={rfq.status} />
          <button
            onClick={deleteRfq}
            disabled={deleting}
            className="text-sm text-red-600 hover:underline disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : 'Delete RFQ'}
          </button>
        </div>
      </div>

      {rfq.hasContent && (
        <Card className="p-0 mb-6 overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-200 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900">RFQ document</span>
            <a
              href={`/api/rfqs/${id}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-blue-600 hover:underline"
            >
              open in new tab
            </a>
          </div>
          <iframe
            src={`/api/rfqs/${id}/pdf`}
            className="w-full h-[70vh] border-0"
            title="RFQ PDF"
          />
        </Card>
      )}

      {submittedCount > 0 && (
        <div className="mb-6 text-sm">
          <Link
            href={`/dashboard/rfqs/${id}/quotes`}
            className="text-blue-600 hover:underline"
          >
            Compare {submittedCount} quote{submittedCount > 1 ? 's' : ''} →
          </Link>
        </div>
      )}

      {error && <div className="mb-4"><ErrorText>{error}</ErrorText></div>}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="font-semibold text-gray-900 mb-3">
              Line items ({lineItems.length})
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-2">Item</th>
                  <th className="py-2">Qty</th>
                  <th className="py-2">Unit</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((li) => (
                  <tr key={li.id} className="border-b border-gray-100">
                    <td className="py-2 text-gray-800">{li.itemDescription}</td>
                    <td className="py-2 text-gray-600">{li.quantity}</td>
                    <td className="py-2 text-gray-600">{li.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card className="p-5">
            <h2 className="font-semibold text-gray-900 mb-3">
              Invitations ({invitations.length})
            </h2>
            {invitations.length === 0 ? (
              <p className="text-sm text-gray-500">
                No suppliers invited yet. Use the panel on the right.
              </p>
            ) : (
              <div className="space-y-2">
                {invitations.map((inv) => (
                  <div
                    key={inv.invitationId}
                    className="flex items-center justify-between border-b border-gray-100 pb-2 text-sm"
                  >
                    <div>
                      <span className="text-gray-900 font-medium">
                        {inv.supplierName}
                      </span>{' '}
                      <StatusBadge status={inv.status} />
                      {inv.remindersSent > 0 && (
                        <span className="text-xs text-gray-400 ml-2">
                          {inv.remindersSent} reminder
                          {inv.remindersSent > 1 ? 's' : ''}
                        </span>
                      )}
                      {inv.totalAmount != null && (
                        <span className="text-xs text-gray-500 ml-2">
                          quoted ${inv.totalAmount.toFixed(2)}
                        </span>
                      )}
                    </div>
                    {inv.status !== 'submitted' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => sendReminder(inv.invitationId)}
                        disabled={remindingId === inv.invitationId}
                      >
                        {remindingId === inv.invitationId
                          ? 'Sending…'
                          : 'Send reminder'}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <SupplierPicker
          rfqId={id}
          alreadyInvited={invitedIds}
          onSent={() => {
            loadRfq();
            loadQuotes();
          }}
        />
      </div>
    </AppShell>
  );
}
