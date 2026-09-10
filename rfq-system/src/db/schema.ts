import {
  pgTable,
  text,
  integer,
  doublePrecision,
  boolean,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core';

// Users table - both procurement and suppliers
export const users = pgTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: text('role', { enum: ['procurement', 'supplier'] }).notNull(),
  companyName: text('company_name'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Policy Documents
export const policyDocuments = pgTable('policy_documents', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text('title').notNull(),
  content: text('content').notNull(),
  category: text('category', { enum: ['general', 'item_specific'] }).notNull(),
  version: integer('version').notNull().default(1),
  isActive: boolean('is_active').notNull().default(true),
  filePath: text('file_path'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// RFQs
export const rfqs = pgTable('rfqs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text('title').notNull().default('Untitled RFQ'),
  description: text('description').notNull().default(''),
  createdBy: text('created_by').notNull().references(() => users.id),
  policyReferences: jsonb('policy_references'),  // array of policy IDs
  status: text('status', { enum: ['draft', 'sent', 'evaluating', 'awarded', 'cancelled'] }).notNull().default('draft'),
  deadline: timestamp('deadline'),
  formSchema: jsonb('form_schema').notNull().default({ sections: [], fields: [] }),  // form builder schema
  // Structured RFQ document (header / line items / commercial fields /
  // questionnaire / terms). Canonical since the conversational-creation
  // refinement; the PDF and form builder both render this.
  rfqDocument: jsonb('rfq_document'),
  // The outline proposed by the Drafting Agent and awaiting the buyer's
  // "Confirm & apply". Shape: { document: RFQDocument, sections: OutlineSection[] }.
  // Cleared once applied. See rfq-outline.ts.
  pendingOutline: jsonb('pending_outline'),
  // Section headings the buyer explicitly unticked on the last apply, so the
  // next outline both keeps them unticked and tells the Drafting Agent not to
  // re-add them. Shape: string[].
  excludedSections: jsonb('excluded_sections'),
  generatedContent: text('generated_content'),  // legacy AI-generated RFQ content (pre-refinement)
  // True once the buyer has run at least one "update" so the RFQ has content.
  hasContent: boolean('has_content').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Chat thread for the conversational RFQ-creation flow. The buyer adds
// messages / pasted content / attached-document text; on an explicit
// "update" the Drafting Agent regenerates the RFQ from the whole thread.
export const rfqDraftMessages = pgTable('rfq_draft_messages', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  rfqId: text('rfq_id').notNull().references(() => rfqs.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
  // 'message' = normal turn; 'attachment' = extracted text from an uploaded /
  // pasted document; 'outline' = an assistant turn carrying a proposed outline
  // for the buyer to review; 'apply' = the buyer confirmed an outline and the
  // RFQ was (re)generated. ('update' is the pre-outline-flow marker, kept for
  // old threads.)
  kind: text('kind', {
    enum: ['message', 'update', 'attachment', 'outline', 'apply'],
  }).notNull().default('message'),
  content: text('content').notNull(),
  attachmentName: text('attachment_name'),  // original filename for kind='attachment'
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// One snapshot of the RFQ document + form schema per "update" (history kept).
export const rfqDocumentVersions = pgTable('rfq_document_versions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  rfqId: text('rfq_id').notNull().references(() => rfqs.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  rfqDocument: jsonb('rfq_document').notNull(),
  formSchema: jsonb('form_schema').notNull(),
  // 'ai' = produced by an "update"; 'manual' = form-builder edit saved.
  source: text('source', { enum: ['ai', 'manual'] }).notNull().default('ai'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// RFQ Line Items
export const rfqLineItems = pgTable('rfq_line_items', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  rfqId: text('rfq_id').notNull().references(() => rfqs.id, { onDelete: 'cascade' }),
  itemDescription: text('item_description').notNull(),
  quantity: doublePrecision('quantity').notNull(),
  unit: text('unit').notNull(),
  specifications: jsonb('specifications'),
  orderIndex: integer('order_index').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Suppliers
export const suppliers = pgTable('suppliers', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').references(() => users.id),  // link to user account if registered
  companyName: text('company_name').notNull(),
  contactEmail: text('contact_email').notNull(),
  contactPhone: text('contact_phone'),
  categories: jsonb('categories').notNull(),  // array of strings
  rating: doublePrecision('rating').default(0),
  performanceSummary: text('performance_summary'),  // AI-generated
  pastOrdersCount: integer('past_orders_count').default(0),
  flags: jsonb('flags'),  // array of warning flags
  reviews: jsonb('reviews'),  // array of review objects
  isActive: boolean('is_active').notNull().default(true),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// RFQ Invitations
export const rfqInvitations = pgTable('rfq_invitations', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  rfqId: text('rfq_id').notNull().references(() => rfqs.id, { onDelete: 'cascade' }),
  supplierId: text('supplier_id').notNull().references(() => suppliers.id),
  // Unguessable token for the supplier's public form link (no login required)
  token: text('token').notNull().$defaultFn(() => crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')).unique(),
  // 'negotiating' = the buyer sent the submitted quote back with comments
  // (for review or negotiation); the supplier can edit and resubmit, which
  // returns it to 'submitted'. See REQUIREMENT_quote-negotiation.md.
  status: text('status', { enum: ['sent', 'viewed', 'submitted', 'declined', 'negotiating'] }).notNull().default('sent'),
  sentAt: timestamp('sent_at'),
  viewedAt: timestamp('viewed_at'),
  submittedAt: timestamp('submitted_at'),
  remindersSent: integer('reminders_sent').default(0),
  lastReminderAt: timestamp('last_reminder_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Quote Drafts — the in-progress quotation for one invitation, before submit.
// One row per invitation, upserted. Exists so a supplier who responds by email
// (or leaves the link half-done) reopens the link with everything already
// filled. Deleted when the quote is submitted. See REQUIREMENT_quote-via-email.
export const quoteDrafts = pgTable('quote_drafts', {
  rfqInvitationId: text('rfq_invitation_id')
    .primaryKey()
    .references(() => rfqInvitations.id, { onDelete: 'cascade' }),
  // { [rfqLineItemId]: LineItemResponse } — the fixed per-line grid state.
  lineResponses: jsonb('line_responses').notNull().default({}),
  // buyer-defined quote-level + questionnaire field values, keyed by field id.
  formData: jsonb('form_data').notNull().default({}),
  notes: text('notes'),
  // target id -> { extractionConfidence, rationale, confirmedBySupplier, isDefault }
  provenance: jsonb('provenance').notNull().default({}),
  // how the latest write happened: 'email' (inbound webhook) or 'link' (the page)
  source: text('source', { enum: ['email', 'link'] }).notNull().default('link'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Quote Submissions
export const quoteSubmissions = pgTable('quote_submissions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  rfqInvitationId: text('rfq_invitation_id').notNull().references(() => rfqInvitations.id, { onDelete: 'cascade' }),
  formData: jsonb('form_data').notNull(),  // complete form submission
  lineItems: jsonb('line_items').notNull(),  // pricing per line item
  totalAmount: doublePrecision('total_amount').notNull(),
  currency: text('currency').notNull().default('USD'),
  attachments: jsonb('attachments'),  // array of file URLs
  notes: text('notes'),
  // Structured caveats the supplier raised against a specific passage of the
  // RFQ / their quote (a heading, a T&C clause, a line) that isn't a field
  // value. Shape: { re: string, comment: string }[]. See the supplier
  // document-preview flow.
  exceptions: jsonb('exceptions'),
  aiExtractedData: jsonb('ai_extracted_data'),  // data extracted from supplier docs
  // Bumped each time the supplier resubmits after a review / negotiation round.
  // 0 = original submission. The row is overwritten in place (no version
  // history for the POC). See REQUIREMENT_quote-negotiation.md.
  revision: integer('revision').notNull().default(0),
  revisedAt: timestamp('revised_at'),
  submittedAt: timestamp('submitted_at').notNull().defaultNow(),
});

// Quote Comments — the buyer's per-field notes on a submitted quote, sent back
// to the supplier as a review or negotiation round. The supplier edits their
// quote and resubmits (no threaded replies for the POC). See
// REQUIREMENT_quote-negotiation.md.
export const quoteComments = pgTable('quote_comments', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  rfqInvitationId: text('rfq_invitation_id')
    .notNull()
    .references(() => rfqInvitations.id, { onDelete: 'cascade' }),
  // 1 for the first round, incremented per send.
  round: integer('round').notNull().default(1),
  // The quote value the comment is pinned to: a per-line field
  // ('line:<lineItemId>:<field>'), a buyer-defined form field id, a whole line
  // ('line:<lineItemId>'), or the quote overall ('__quote').
  fieldId: text('field_id').notNull(),
  // Human-readable anchor, e.g. "Line 3 — Unit price" or "Payment terms".
  fieldLabel: text('field_label').notNull(),
  // Snapshot of what the supplier had submitted for that field when the
  // comment was made (for the email + the supplier's context).
  quotedValue: text('quoted_value'),
  comment: text('comment').notNull(),
  // Same mechanics; only the copy to the supplier differs.
  intent: text('intent', { enum: ['review', 'negotiation'] }).notNull().default('review'),
  // 'open' = still being drafted by the buyer; 'sent' = emailed to the
  // supplier this round; 'addressed' = the supplier has since resubmitted.
  status: text('status', { enum: ['open', 'sent', 'addressed'] }).notNull().default('open'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  sentAt: timestamp('sent_at'),
});

// Purchase Orders
export const purchaseOrders = pgTable('purchase_orders', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  rfqId: text('rfq_id').notNull().references(() => rfqs.id),
  poNumber: text('po_number').notNull().unique(),
  awards: jsonb('awards').notNull(),  // [{supplierId, lineItems[], total}]
  strategyUsed: text('strategy_used').notNull(),  // natural language strategy
  strategyReasoning: text('strategy_reasoning'),  // AI explanation
  status: text('status', { enum: ['draft', 'sent', 'accepted', 'rejected'] }).notNull().default('draft'),
  totalValue: doublePrecision('total_value').notNull(),
  currency: text('currency').notNull().default('USD'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// AI Execution Logs
export const aiLogs = pgTable('ai_logs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  agentType: text('agent_type', {
    enum: ['drafting', 'form_generation', 'supplier_filtering', 'autofill', 'evaluation']
  }).notNull(),
  rfqId: text('rfq_id').references(() => rfqs.id),
  inputData: jsonb('input_data'),
  outputData: jsonb('output_data'),
  modelUsed: text('model_used').notNull(),
  tokensUsed: integer('tokens_used'),
  costUsd: doublePrecision('cost_usd'),
  durationMs: integer('duration_ms'),
  success: boolean('success').notNull(),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Chat Messages (for supplier AI chat)
export const chatMessages = pgTable('chat_messages', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  rfqInvitationId: text('rfq_invitation_id').notNull().references(() => rfqInvitations.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant'] }).notNull(),
  content: text('content').notNull(),
  attachments: jsonb('attachments'),  // files uploaded in this message
  extractedData: jsonb('extracted_data'),  // data extracted from attachments
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Email Logs (for tracking email delivery)
export const emailLogs = pgTable('email_logs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  recipientEmail: text('recipient_email').notNull(),
  subject: text('subject').notNull(),
  type: text('type', {
    enum: [
      'rfq_invitation',
      'reminder',
      'purchase_order',
      'quote_ack',
      'quote_review',
      'quote_negotiation',
      'quote_revised',
    ],
  }).notNull(),
  rfqId: text('rfq_id').references(() => rfqs.id),
  rfqInvitationId: text('rfq_invitation_id').references(() => rfqInvitations.id),
  purchaseOrderId: text('purchase_order_id').references(() => purchaseOrders.id),
  status: text('status', { enum: ['sent', 'delivered', 'failed', 'bounced'] }).notNull(),
  externalId: text('external_id'),  // Resend email ID
  errorMessage: text('error_message'),
  // Rendered HTML body + attachment metadata, kept so the in-app Supplier
  // Mailbox simulator can display and reply to outbound mail without a real
  // inbox. POC-only convenience — see /dashboard/mailbox.
  bodyHtml: text('body_html'),
  attachments: jsonb('attachments'),  // [{ filename, bytes }]
  sentAt: timestamp('sent_at').notNull().defaultNow(),
});

// Types for TypeScript
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type PolicyDocument = typeof policyDocuments.$inferSelect;
export type NewPolicyDocument = typeof policyDocuments.$inferInsert;

export type RFQ = typeof rfqs.$inferSelect;
export type NewRFQ = typeof rfqs.$inferInsert;

export type RFQDraftMessage = typeof rfqDraftMessages.$inferSelect;
export type NewRFQDraftMessage = typeof rfqDraftMessages.$inferInsert;

export type RFQDocumentVersion = typeof rfqDocumentVersions.$inferSelect;
export type NewRFQDocumentVersion = typeof rfqDocumentVersions.$inferInsert;

export type RFQLineItem = typeof rfqLineItems.$inferSelect;
export type NewRFQLineItem = typeof rfqLineItems.$inferInsert;

export type Supplier = typeof suppliers.$inferSelect;
export type NewSupplier = typeof suppliers.$inferInsert;

export type RFQInvitation = typeof rfqInvitations.$inferSelect;
export type NewRFQInvitation = typeof rfqInvitations.$inferInsert;

export type QuoteSubmission = typeof quoteSubmissions.$inferSelect;
export type NewQuoteSubmission = typeof quoteSubmissions.$inferInsert;

export type QuoteDraft = typeof quoteDrafts.$inferSelect;
export type NewQuoteDraft = typeof quoteDrafts.$inferInsert;

export type QuoteComment = typeof quoteComments.$inferSelect;
export type NewQuoteComment = typeof quoteComments.$inferInsert;

export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type NewPurchaseOrder = typeof purchaseOrders.$inferInsert;

export type AILog = typeof aiLogs.$inferSelect;
export type NewAILog = typeof aiLogs.$inferInsert;

export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;

export type EmailLog = typeof emailLogs.$inferSelect;
export type NewEmailLog = typeof emailLogs.$inferInsert;
