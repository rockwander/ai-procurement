'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { FormBuilder } from '@/components/FormBuilder';
import { Button, Card, Input, Textarea, Spinner, ErrorText, Badge } from '@/components/ui';
import { api } from '@/lib/fetcher';
import { FormSchema, emptySchema } from '@/lib/form-schema';
import type { RFQDraftOutput } from '@/lib/agents/rfq-drafting';

interface Policy {
  id: string;
  title: string;
  category: string;
}

export default function NewRFQPage() {
  const router = useRouter();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [selectedPolicies, setSelectedPolicies] = useState<string[]>([]);
  const [requirements, setRequirements] = useState('');
  const [itemCategory, setItemCategory] = useState('');
  const [deadline, setDeadline] = useState('');

  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [draft, setDraft] = useState<RFQDraftOutput | null>(null);
  const [schema, setSchema] = useState<FormSchema>(emptySchema());
  const [usage, setUsage] = useState<any>(null);

  useEffect(() => {
    api<{ policies: Policy[] }>('/api/policies')
      .then((d) => setPolicies(d.policies))
      .catch(() => {});
  }, []);

  async function generate() {
    setError('');
    setDrafting(true);
    try {
      const res = await api<{
        draft: RFQDraftOutput;
        formSchema: FormSchema;
        usage: any;
      }>('/api/rfqs/draft', {
        method: 'POST',
        body: JSON.stringify({
          businessRequirements: requirements,
          policyIds: selectedPolicies,
          itemCategory: itemCategory || undefined,
          deadline: deadline || undefined,
        }),
      });
      setDraft(res.draft);
      setSchema(
        res.formSchema?.fields?.length ? res.formSchema : emptySchema()
      );
      setUsage(res.usage);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDrafting(false);
    }
  }

  async function save() {
    if (!draft) return;
    setError('');
    setSaving(true);
    try {
      const res = await api<{ rfq: { id: string } }>('/api/rfqs', {
        method: 'POST',
        body: JSON.stringify({
          title: draft.title,
          description: draft.description,
          generatedContent: draft,
          formSchema: schema,
          lineItems: draft.lineItems,
          policyIds: selectedPolicies,
          deadline: deadline || undefined,
        }),
      });
      router.push(`/dashboard/rfqs/${res.rfq.id}`);
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Create RFQ</h1>
      <p className="text-gray-500 mb-6 text-sm">
        Describe the need and pick applicable policies. The drafting agent writes
        the RFQ and a starter quote form for you to refine.
      </p>

      {error && <div className="mb-4"><ErrorText>{error}</ErrorText></div>}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Inputs */}
        <Card className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Business requirements
            </label>
            <Textarea
              rows={7}
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
              placeholder="e.g. We need 50 business laptops for the new sales team, delivered within 6 weeks. Must run our standard security image, 3-year warranty…"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Item category
              </label>
              <Input
                value={itemCategory}
                onChange={(e) => setItemCategory(e.target.value)}
                placeholder="IT Equipment"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Response deadline
              </label>
              <Input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Policy documents
            </label>
            <div className="space-y-1">
              {policies.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedPolicies.includes(p.id)}
                    onChange={(e) =>
                      setSelectedPolicies((prev) =>
                        e.target.checked
                          ? [...prev, p.id]
                          : prev.filter((id) => id !== p.id)
                      )
                    }
                  />
                  {p.title}
                  <Badge color={p.category === 'general' ? 'gray' : 'blue'}>
                    {p.category}
                  </Badge>
                </label>
              ))}
              {policies.length === 0 && (
                <p className="text-sm text-gray-400">No policies loaded.</p>
              )}
            </div>
          </div>

          <Button onClick={generate} disabled={drafting || requirements.trim().length < 10}>
            {drafting ? 'Drafting…' : draft ? 'Regenerate' : 'Generate RFQ with AI'}
          </Button>
          {drafting && <Spinner label="Running drafting + form-generation agents…" />}
        </Card>

        {/* Draft preview + form builder */}
        <Card className="p-5 space-y-4">
          {!draft ? (
            <p className="text-sm text-gray-400">
              The generated RFQ and quote form will appear here.
            </p>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                  Title
                </label>
                <Input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                  Description
                </label>
                <Textarea
                  rows={4}
                  value={draft.description}
                  onChange={(e) =>
                    setDraft({ ...draft, description: e.target.value })
                  }
                />
              </div>

              <div>
                <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                  Line items ({draft.lineItems.length})
                </p>
                <ul className="text-sm text-gray-700 list-disc pl-5 space-y-0.5">
                  {draft.lineItems.map((li, i) => (
                    <li key={i}>
                      {li.itemDescription} — {li.quantity} {li.unit}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="text-xs font-medium text-gray-500 uppercase mb-2">
                  Quote form builder
                </p>
                <FormBuilder schema={schema} onChange={setSchema} />
              </div>

              {usage && (
                <p className="text-xs text-gray-400">
                  AI cost ~$
                  {(
                    (usage.drafting?.costUsd ?? 0) +
                    (usage.formGeneration?.costUsd ?? 0)
                  ).toFixed(4)}
                </p>
              )}

              <Button onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save RFQ'}
              </Button>
            </>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
