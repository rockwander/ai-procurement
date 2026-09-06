import { Resend } from 'resend';
import { db } from '@/db';
import { emailLogs } from '@/db/schema';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.EMAIL_FROM || 'onboarding@resend.dev';

export interface SendRFQEmailParams {
  to: string;
  supplierName: string;
  rfqTitle: string;
  rfqSummary: string;
  formLink: string;
  pdfAttachment?: {
    filename: string;
    content: Buffer;
  };
  deadline?: string;
}

export interface SendReminderEmailParams {
  to: string;
  supplierName: string;
  rfqTitle: string;
  formLink: string;
  deadline?: string;
  daysRemaining?: number;
}

export interface SendPOEmailParams {
  to: string;
  supplierName: string;
  poNumber: string;
  totalAmount: number;
  pdfAttachment: {
    filename: string;
    content: Buffer;
  };
}

// Send RFQ Invitation Email
export async function sendRFQEmail(params: SendRFQEmailParams, rfqId?: string, invitationId?: string) {
  try {
    const subject = `RFQ: ${params.rfqTitle}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
          .content { background: #f9fafb; padding: 30px; }
          .button { display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Request for Quotation</h1>
          </div>
          <div class="content">
            <p>Dear ${params.supplierName},</p>

            <p>You have been invited to submit a quote for the following RFQ:</p>

            <h2>${params.rfqTitle}</h2>

            <p>${params.rfqSummary}</p>

            ${params.deadline ? `<p><strong>Deadline:</strong> ${new Date(params.deadline).toLocaleDateString()}</p>` : ''}

            <p>To submit your quote, please:</p>
            <ol>
              <li>Review the attached RFQ document (PDF)</li>
              <li>Click the button below to access the quote submission form</li>
              <li>Fill in all required fields</li>
              <li>Submit before the deadline</li>
            </ol>

            <p style="text-align: center;">
              <a href="${params.formLink}" class="button">Submit Quote</a>
            </p>

            <p><strong>Important:</strong> Direct email replies will not be accepted. Please use the form link above to submit your quote.</p>

            <p>If you have any questions, please contact our procurement team.</p>

            <p>Best regards,<br>Procurement Team</p>
          </div>
          <div class="footer">
            <p>This is an automated email. Please do not reply directly to this message.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const emailData: any = {
      from: FROM_EMAIL,
      to: params.to,
      subject,
      html,
    };

    if (params.pdfAttachment) {
      emailData.attachments = [
        {
          filename: params.pdfAttachment.filename,
          content: params.pdfAttachment.content,
        },
      ];
    }

    const { data, error } = await resend.emails.send(emailData);

    // Log email
    await db.insert(emailLogs).values({
      recipientEmail: params.to,
      subject,
      type: 'rfq_invitation',
      rfqId,
      rfqInvitationId: invitationId,
      status: error ? 'failed' : 'sent',
      externalId: data?.id,
      errorMessage: error?.message,
    });

    if (error) {
      console.error('Failed to send RFQ email:', error);
      return { success: false, error: error.message };
    }

    console.log(`✅ RFQ email sent to ${params.to}`);
    return { success: true, emailId: data?.id };
  } catch (error) {
    console.error('Error sending RFQ email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Send Reminder Email
export async function sendReminderEmail(params: SendReminderEmailParams, invitationId?: string) {
  try {
    const subject = `Reminder: RFQ Quote Submission - ${params.rfqTitle}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #f59e0b; color: white; padding: 20px; text-align: center; }
          .content { background: #f9fafb; padding: 30px; }
          .button { display: inline-block; padding: 12px 24px; background: #f59e0b; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .urgent { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⏰ RFQ Reminder</h1>
          </div>
          <div class="content">
            <p>Dear ${params.supplierName},</p>

            <div class="urgent">
              <strong>Reminder:</strong> You have not yet submitted your quote for:<br>
              <strong>${params.rfqTitle}</strong>
            </div>

            ${params.daysRemaining ? `<p><strong>${params.daysRemaining} day${params.daysRemaining > 1 ? 's' : ''} remaining</strong> to submit your quote.</p>` : ''}

            ${params.deadline ? `<p><strong>Deadline:</strong> ${new Date(params.deadline).toLocaleDateString()}</p>` : ''}

            <p style="text-align: center;">
              <a href="${params.formLink}" class="button">Submit Quote Now</a>
            </p>

            <p>Don't miss this opportunity. Submit your quote before the deadline.</p>

            <p>Best regards,<br>Procurement Team</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject,
      html,
    });

    // Log email
    await db.insert(emailLogs).values({
      recipientEmail: params.to,
      subject,
      type: 'reminder',
      rfqInvitationId: invitationId,
      status: error ? 'failed' : 'sent',
      externalId: data?.id,
      errorMessage: error?.message,
    });

    if (error) {
      console.error('Failed to send reminder email:', error);
      return { success: false, error: error.message };
    }

    console.log(`✅ Reminder email sent to ${params.to}`);
    return { success: true, emailId: data?.id };
  } catch (error) {
    console.error('Error sending reminder email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Send Purchase Order Email
export async function sendPOEmail(params: SendPOEmailParams, poId?: string) {
  try {
    const subject = `Purchase Order ${params.poNumber}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #10b981; color: white; padding: 20px; text-align: center; }
          .content { background: #f9fafb; padding: 30px; }
          .highlight { background: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Purchase Order Issued</h1>
          </div>
          <div class="content">
            <p>Dear ${params.supplierName},</p>

            <p>Congratulations! Your quote has been selected.</p>

            <div class="highlight">
              <strong>Purchase Order Number:</strong> ${params.poNumber}<br>
              <strong>Total Amount:</strong> $${params.totalAmount.toFixed(2)}
            </div>

            <p>Please find the complete purchase order attached to this email (PDF).</p>

            <p><strong>Next Steps:</strong></p>
            <ol>
              <li>Review the purchase order details</li>
              <li>Confirm acceptance within 48 hours</li>
              <li>Begin order fulfillment as per agreed terms</li>
            </ol>

            <p>Thank you for your partnership.</p>

            <p>Best regards,<br>Procurement Team</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject,
      html,
      attachments: [
        {
          filename: params.pdfAttachment.filename,
          content: params.pdfAttachment.content,
        },
      ],
    });

    // Log email
    await db.insert(emailLogs).values({
      recipientEmail: params.to,
      subject,
      type: 'purchase_order',
      purchaseOrderId: poId,
      status: error ? 'failed' : 'sent',
      externalId: data?.id,
      errorMessage: error?.message,
    });

    if (error) {
      console.error('Failed to send PO email:', error);
      return { success: false, error: error.message };
    }

    console.log(`✅ PO email sent to ${params.to}`);
    return { success: true, emailId: data?.id };
  } catch (error) {
    console.error('Error sending PO email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
