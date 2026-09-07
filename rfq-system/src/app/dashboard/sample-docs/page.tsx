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
}

interface SupplierDoc {
  slug: string;
  supplierName: string;
  kind: 'quote' | 'faq';
  format: 'pdf' | 'csv';
  fileName: string;
  title: string;
  completeness: number;
}

const KIND_LABEL: Record<SampleDoc['kind'], string> = {
  requisition: 'Item request',
  policy: 'Policy',
  rfq: 'RFQ',
};

function DownloadLinks({ slug }: { slug: string }) {
  return (
    <div className="mt-auto flex gap-3 text-sm pt-2">
      <a
        href={`/api/sample-docs/${slug}`}
        target="_blank"
        rel="noreferrer"
        className="text-blue-600 hover:underline"
      >
        Preview
      </a>
      <a
        href={`/api/sample-docs/${slug}?download=1`}
        className="text-blue-600 hover:underline"
      >
        Download
      </a>
    </div>
  );
}

function DocCard({ d }: { d: SampleDoc }) {
  return (
    <Card className="p-5 flex flex-col">
      <div className="flex items-start justify-between mb-2 gap-2">
        <h2 className="font-semibold text-gray-900">{d.title}</h2>
        <Badge color={d.kind === 'rfq' ? 'blue' : 'gray'}>{KIND_LABEL[d.kind]}</Badge>
      </div>
      <p className="text-sm text-gray-600 mb-3">{d.summary}</p>
      <p className="text-xs text-gray-400 truncate">{d.fileName}</p>
      <DownloadLinks slug={d.slug} />
    </Card>
  );
}

function SupplierGroup({ name, docs }: { name: string; docs: SupplierDoc[] }) {
  const completeness = docs[0]?.completeness ?? 0;
  const tone =
    completeness >= 100 ? 'green' : completeness >= 80 ? 'yellow' : 'red';
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between mb-3 gap-2">
        <h3 className="font-semibold text-gray-900">{name}</h3>
        <Badge color={tone}>{completeness}% complete</Badge>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        {completeness >= 100
          ? 'All prices and questionnaire answers supplied — autofill should populate the whole form.'
          : completeness >= 80
          ? 'Most fields supplied; a few line prices, commercial terms and answers are missing — key those in via chat or the form.'
          : 'A budgetary quote with gaps — several line prices, MOQ, freight and answers are missing or "TBD".'}
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        {docs.map((d) => (
          <div key={d.slug} className="border border-gray-200 rounded-lg p-3 flex flex-col">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-800">
                {d.kind === 'quote' ? 'Quotation' : 'Questionnaire answers'}
              </span>
              <Badge color="gray">{d.format.toUpperCase()}</Badge>
            </div>
            <p className="text-xs text-gray-400 truncate">{d.fileName}</p>
            <DownloadLinks slug={d.slug} />
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function SampleDocsPage() {
  const [docs, setDocs] = useState<SampleDoc[]>([]);
  const [supplierDocs, setSupplierDocs] = useState<SupplierDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ docs: SampleDoc[]; supplierDocs: SupplierDoc[] }>('/api/sample-docs')
      .then((d) => {
        setDocs(d.docs);
        setSupplierDocs(d.supplierDocs ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const source = docs.filter((d) => d.kind !== 'rfq');
  const rfqs = docs.filter((d) => d.kind === 'rfq');

  const suppliers = Array.from(
    supplierDocs.reduce((m, d) => {
      (m.get(d.supplierName) ?? m.set(d.supplierName, []).get(d.supplierName)!).push(d);
      return m;
    }, new Map<string, SupplierDoc[]>())
  );

  return (
    <AppShell>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Sample documents</h1>
      <p className="text-gray-500 mb-6 text-sm max-w-3xl">
        A worked example end to end. The two <span className="font-medium">source
        documents</span> feed the drafting of the <span className="font-medium">RFQ</span>;
        the <span className="font-medium">supplier submissions</span> are what three
        vendors send back, at varying levels of completeness, to test autofill and
        manual key-in on the quote form.
      </p>

      {error && <div className="mb-4"><ErrorText>{error}</ErrorText></div>}
      {loading ? (
        <Spinner label="Loading…" />
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              1. Source documents — attach these when creating the RFQ
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

          {suppliers.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                3. Supplier submissions — attach these on the quote form
              </h2>
              <div className="space-y-4">
                {suppliers.map(([name, ds]) => (
                  <SupplierGroup key={name} name={name} docs={ds} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}
