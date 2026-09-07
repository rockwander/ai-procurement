'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Card, Badge, Spinner, ErrorText } from '@/components/ui';
import { api } from '@/lib/fetcher';

interface SampleDoc {
  slug: string;
  kind: 'requisition' | 'policy' | 'rfq';
  fileName: string;
  title: string;
  summary: string;
  category: string;
  relatedSlugs: string[];
}

const KIND_LABEL: Record<SampleDoc['kind'], string> = {
  requisition: 'Item request',
  policy: 'Policy',
  rfq: 'RFQ',
};

function DocCard({ d }: { d: SampleDoc }) {
  return (
    <Card className="p-5 flex flex-col">
      <div className="flex items-start justify-between mb-2 gap-2">
        <h2 className="font-semibold text-gray-900">{d.title}</h2>
        <Badge color={d.kind === 'rfq' ? 'blue' : 'gray'}>{KIND_LABEL[d.kind]}</Badge>
      </div>
      <p className="text-sm text-gray-600 mb-3">{d.summary}</p>
      <p className="text-xs text-gray-400 mb-4 truncate">{d.fileName}</p>
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
  );
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

  const source = docs.filter((d) => d.kind !== 'rfq');
  const rfqs = docs.filter((d) => d.kind === 'rfq');

  return (
    <AppShell>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Sample documents</h1>
      <p className="text-gray-500 mb-6 text-sm max-w-3xl">
        A worked example of how an RFQ comes together. The two{' '}
        <span className="font-medium">source documents</span> — a business-approved
        item request and the procurement policy — contain the demand, the approvals,
        and the category rules. Download them, start a new RFQ, and attach both in the
        chat; the drafting agent builds the RFQ from them. The finished{' '}
        <span className="font-medium">RFQ</span> below shows the expected result.
      </p>

      {error && <div className="mb-4"><ErrorText>{error}</ErrorText></div>}
      {loading ? (
        <Spinner label="Loading…" />
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              1. Source documents — attach these
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {source.map((d) => (
                <DocCard key={d.slug} d={d} />
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              2. Resulting RFQ — the expected output
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {rfqs.map((d) => (
                <DocCard key={d.slug} d={d} />
              ))}
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
