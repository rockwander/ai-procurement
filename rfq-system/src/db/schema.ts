import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// Users table - both procurement and suppliers
export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: text('role', { enum: ['procurement', 'supplier'] }).notNull(),
  companyName: text('company_name'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// Policy Documents
export const policyDocuments = sqliteTable('policy_documents', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text('title').notNull(),
  content: text('content').notNull(),
  category: text('category', { enum: ['general', 'item_specific'] }).notNull(),
  version: integer('version').notNull().default(1),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  filePath: text('file_path'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// RFQs
export const rfqs = sqliteTable('rfqs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text('title').notNull(),
  description: text('description').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
  policyReferences: text('policy_references', { mode: 'json' }),  // array of policy IDs
  status: text('status', { enum: ['draft', 'sent', 'evaluating', 'awarded', 'cancelled'] }).notNull().default('draft'),
  deadline: integer('deadline', { mode: 'timestamp' }),
  formSchema: text('form_schema', { mode: 'json' }).notNull(),  // form builder schema
  generatedContent: text('generated_content'),  // AI-generated RFQ content
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// RFQ Line Items
export const rfqLineItems = sqliteTable('rfq_line_items', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  rfqId: text('rfq_id').notNull().references(() => rfqs.id, { onDelete: 'cascade' }),
  itemDescription: text('item_description').notNull(),
  quantity: real('quantity').notNull(),
  unit: text('unit').notNull(),
  specifications: text('specifications', { mode: 'json' }),
  orderIndex: integer('order_index').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// Suppliers
export const suppliers = sqliteTable('suppliers', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').references(() => users.id),  // link to user account if registered
  companyName: text('company_name').notNull(),
  contactEmail: text('contact_email').notNull(),
  contactPhone: text('contact_phone'),
  categories: text('categories', { mode: 'json' }).notNull(),  // array of strings
  rating: real('rating').default(0),
  performanceSummary: text('performance_summary'),  // AI-generated
  pastOrdersCount: integer('past_orders_count').default(0),
  flags: text('flags', { mode: 'json' }),  // array of warning flags
  reviews: text('reviews', { mode: 'json' }),  // array of review objects
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  metadata: text('metadata', { mode: 'json' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// RFQ Invitations
export const rfqInvitations = sqliteTable('rfq_invitations', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  rfqId: text('rfq_id').notNull().references(() => rfqs.id, { onDelete: 'cascade' }),
  supplierId: text('supplier_id').notNull().references(() => suppliers.id),
  status: text('status', { enum: ['sent', 'viewed', 'submitted', 'declined'] }).notNull().default('sent'),
  sentAt: integer('sent_at', { mode: 'timestamp' }),
  viewedAt: integer('viewed_at', { mode: 'timestamp' }),
  submittedAt: integer('submitted_at', { mode: 'timestamp' }),
  remindersSent: integer('reminders_sent').default(0),
  lastReminderAt: integer('last_reminder_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// Quote Submissions
export const quoteSubmissions = sqliteTable('quote_submissions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  rfqInvitationId: text('rfq_invitation_id').notNull().references(() => rfqInvitations.id, { onDelete: 'cascade' }),
  formData: text('form_data', { mode: 'json' }).notNull(),  // complete form submission
  lineItems: text('line_items', { mode: 'json' }).notNull(),  // pricing per line item
  totalAmount: real('total_amount').notNull(),
  currency: text('currency').notNull().default('USD'),
  attachments: text('attachments', { mode: 'json' }),  // array of file URLs
  notes: text('notes'),
  aiExtractedData: text('ai_extracted_data', { mode: 'json' }),  // data extracted from supplier docs
  submittedAt: integer('submitted_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// Purchase Orders
export const purchaseOrders = sqliteTable('purchase_orders', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  rfqId: text('rfq_id').notNull().references(() => rfqs.id),
  poNumber: text('po_number').notNull().unique(),
  awards: text('awards', { mode: 'json' }).notNull(),  // [{supplierId, lineItems[], total}]
  strategyUsed: text('strategy_used').notNull(),  // natural language strategy
  strategyReasoning: text('strategy_reasoning'),  // AI explanation
  status: text('status', { enum: ['draft', 'sent', 'accepted', 'rejected'] }).notNull().default('draft'),
  totalValue: real('total_value').notNull(),
  currency: text('currency').notNull().default('USD'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// AI Execution Logs
export const aiLogs = sqliteTable('ai_logs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  agentType: text('agent_type', {
    enum: ['drafting', 'form_generation', 'supplier_filtering', 'autofill', 'evaluation']
  }).notNull(),
  rfqId: text('rfq_id').references(() => rfqs.id),
  inputData: text('input_data', { mode: 'json' }),
  outputData: text('output_data', { mode: 'json' }),
  modelUsed: text('model_used').notNull(),
  tokensUsed: integer('tokens_used'),
  costUsd: real('cost_usd'),
  durationMs: integer('duration_ms'),
  success: integer('success', { mode: 'boolean' }).notNull(),
  errorMessage: text('error_message'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// Chat Messages (for supplier AI chat)
export const chatMessages = sqliteTable('chat_messages', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  rfqInvitationId: text('rfq_invitation_id').notNull().references(() => rfqInvitations.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant'] }).notNull(),
  content: text('content').notNull(),
  attachments: text('attachments', { mode: 'json' }),  // files uploaded in this message
  extractedData: text('extracted_data', { mode: 'json' }),  // data extracted from attachments
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// Email Logs (for tracking email delivery)
export const emailLogs = sqliteTable('email_logs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  recipientEmail: text('recipient_email').notNull(),
  subject: text('subject').notNull(),
  type: text('type', { enum: ['rfq_invitation', 'reminder', 'purchase_order'] }).notNull(),
  rfqId: text('rfq_id').references(() => rfqs.id),
  rfqInvitationId: text('rfq_invitation_id').references(() => rfqInvitations.id),
  purchaseOrderId: text('purchase_order_id').references(() => purchaseOrders.id),
  status: text('status', { enum: ['sent', 'delivered', 'failed', 'bounced'] }).notNull(),
  externalId: text('external_id'),  // Resend email ID
  errorMessage: text('error_message'),
  sentAt: integer('sent_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// Types for TypeScript
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type PolicyDocument = typeof policyDocuments.$inferSelect;
export type NewPolicyDocument = typeof policyDocuments.$inferInsert;

export type RFQ = typeof rfqs.$inferSelect;
export type NewRFQ = typeof rfqs.$inferInsert;

export type RFQLineItem = typeof rfqLineItems.$inferSelect;
export type NewRFQLineItem = typeof rfqLineItems.$inferInsert;

export type Supplier = typeof suppliers.$inferSelect;
export type NewSupplier = typeof suppliers.$inferInsert;

export type RFQInvitation = typeof rfqInvitations.$inferSelect;
export type NewRFQInvitation = typeof rfqInvitations.$inferInsert;

export type QuoteSubmission = typeof quoteSubmissions.$inferSelect;
export type NewQuoteSubmission = typeof quoteSubmissions.$inferInsert;

export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type NewPurchaseOrder = typeof purchaseOrders.$inferInsert;

export type AILog = typeof aiLogs.$inferSelect;
export type NewAILog = typeof aiLogs.$inferInsert;

export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;

export type EmailLog = typeof emailLogs.$inferSelect;
export type NewEmailLog = typeof emailLogs.$inferInsert;
