'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Card, Badge, Spinner, ErrorText } from '@/components/ui';
import { api } from '@/lib/fetcher';

interface SampleDoc {
  slug: string;
  fileName: string;
  title: string;
  category: string;
  buyer: string;
  lineItems: number;
  currency: string;
}

export default function SampleDocsPage() {
  const [docs, setDocs] = useState<SampleDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ docs: SampleDoc[] }>('/api/sample-docs')
      .then((d) => setDocs(d.docs))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Sample documents</h1>
      <p className="text-gray-500 mb-6 text-sm">
        Realistic buyer-issued RFQ documents for testing. Download one, then start
        a new RFQ and attach it in the chat to see the drafting agent build the
        RFQ from it.
      </p>

      {error && <div className="mb-4"><ErrorText>{error}</ErrorText></div>}
      {loading ? (
        <Spinner label="Loading…" />
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {docs.map((d) => (
            <Card key={d.slug} className="p-5 flex flex-col">
              <div className="flex items-start justify-between mb-2">
                <h2 className="font-semibold text-gray-900">{d.title}</h2>
                <Badge color="blue">{d.category}</Badge>
              </div>
              <dl className="text-sm text-gray-600 space-y-0.5 mb-4">
                <div><span className="text-gray-400">Buyer:</span> {d.buyer}</div>
                <div><span className="text-gray-400">Line items:</span> {d.lineItems}</div>
                <div><span className="text-gray-400">Currency:</span> {d.currency}</div>
                <div className="text-gray-400 truncate">{d.fileName}</div>
              </dl>
              <div className="mt-auto flex gap-3 text-sm">
                <a
                  href={`/api/sample-docs/${d.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Preview
                </a>
                <a
                  href={`/api/sample-docs/${d.slug}?download=1`}
                  className="text-blue-600 hover:underline"
                >
                  Download PDF
                </a>
              </div>
            </Card>
          ))}
          {docs.length === 0 && (
            <p className="text-sm text-gray-400">No sample documents.</p>
          )}
        </div>
      )}
    </AppShell>
  );
}
