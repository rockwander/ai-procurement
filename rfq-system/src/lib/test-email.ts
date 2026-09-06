import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

async function testEmail() {
  console.log('🧪 Testing Resend email service...\n');

  try {
    const { data, error } = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: 'vishalragh13@gmail.com',
      subject: 'Test Email - RFQ System',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #2563eb;">✅ Email Service Working!</h1>
          <p>Your Resend integration is configured correctly.</p>
          <p><strong>RFQ System Status:</strong></p>
          <ul>
            <li>✅ Email service: Connected</li>
            <li>✅ API key: Valid</li>
            <li>✅ Ready to send RFQ invitations</li>
          </ul>
          <p>You can now proceed with the full application setup.</p>
        </div>
      `,
    });

    if (error) {
      console.error('❌ Email test failed:', error);
      process.exit(1);
    }

    console.log('✅ Email sent successfully!');
    console.log('📧 Email ID:', data?.id);
    console.log('📬 Sent to: vishalragh13@gmail.com');
    console.log('\n✅ Resend service is working correctly!\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testEmail();
