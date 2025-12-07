import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

let transporter: Transporter | null = null;

/**
 * Initialize Nodemailer transporter
 */
function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '465'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

export interface EmailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

/**
 * Send email
 */
export async function sendEmail(options: EmailOptions): Promise<void> {
  if (process.env.EMAIL_ENABLED !== 'true') {
    console.log('[Email] Skipped (disabled):', options.subject);
    return;
  }

  try {
    const transport = getTransporter();
    
    await transport.sendMail({
      from: process.env.SMTP_FROM || 'Evolvx <noreply@trivx.in>',
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    console.log(`✅ Email sent to ${options.to}: ${options.subject}`);
  } catch (error) {
    console.error('❌ Failed to send email:', error);
    throw error;
  }
}

/**
 * Email Templates
 */

export async function sendMemberInviteEmail(
  email: string,
  orgName: string,
  inviterName: string,
  inviteLink: string
): Promise<void> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🚀 You're Invited to Join ${orgName}</h1>
        </div>
        <div class="content">
          <p>Hello!</p>
          <p><strong>${inviterName}</strong> has invited you to join <strong>${orgName}</strong> on Evolvx.AI.</p>
          <p>Evolvx.AI is an AI-powered DevOps platform that makes deployments as easy as a conversation.</p>
          <p style="text-align: center;">
            <a href="${inviteLink}" class="button">Accept Invitation</a>
          </p>
          <p style="color: #6b7280; font-size: 14px;">
            If you didn't expect this invitation, you can safely ignore this email.
          </p>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} Evolvx.AI - AI-Powered DevOps Automation</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await sendEmail({
    to: email,
    subject: `You've been invited to join ${orgName} on Evolvx.AI`,
    html,
  });
}

export async function sendDeploymentSuccessEmail(
  email: string,
  projectName: string,
  deploymentUrl: string,
  version: string
): Promise<void> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
        .success { color: #10b981; font-size: 48px; }
        .button { display: inline-block; background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .details { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="success">✅</div>
          <h1>Deployment Successful!</h1>
        </div>
        <div class="content">
          <p>Great news! Your deployment has completed successfully.</p>
          <div class="details">
            <p><strong>Project:</strong> ${projectName}</p>
            <p><strong>Version:</strong> ${version}</p>
            <p><strong>Status:</strong> <span style="color: #10b981;">Live</span></p>
          </div>
          <p style="text-align: center;">
            <a href="${deploymentUrl}" class="button">View Deployment</a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  await sendEmail({
    to: email,
    subject: `✅ Deployment Successful: ${projectName} (${version})`,
    html,
  });
}

export async function sendDeploymentFailureEmail(
  email: string,
  projectName: string,
  version: string,
  errorMessage: string,
  logsUrl: string
): Promise<void> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
        .error { color: #ef4444; font-size: 48px; }
        .button { display: inline-block; background: #ef4444; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .error-box { background: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin: 15px 0; border-radius: 5px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="error">❌</div>
          <h1>Deployment Failed</h1>
        </div>
        <div class="content">
          <p>Unfortunately, your deployment encountered an error.</p>
          <div class="error-box">
            <p><strong>Project:</strong> ${projectName}</p>
            <p><strong>Version:</strong> ${version}</p>
            <p><strong>Error:</strong> ${errorMessage}</p>
          </div>
          <p style="text-align: center;">
            <a href="${logsUrl}" class="button">View Logs</a>
          </p>
          <p style="color: #6b7280; font-size: 14px;">
            Our AI can help diagnose the issue. Check logs for details or ask the AI assistant for help.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  await sendEmail({
    to: email,
    subject: `❌ Deployment Failed: ${projectName} (${version})`,
    html,
  });
}

export async function sendWelcomeEmail(
  email: string,
  name: string
): Promise<void> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .feature { background: white; padding: 15px; margin: 10px 0; border-radius: 5px; border-left: 4px solid #667eea; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎉 Welcome to Evolvx.AI!</h1>
        </div>
        <div class="content">
          <p>Hi ${name},</p>
          <p>Welcome to Evolvx.AI! We're excited to have you on board.</p>
          <p>With Evolvx.AI, you can:</p>
          <div class="feature">
            <strong>🚀 Deploy with AI</strong><br/>
            Just chat with our AI and deploy your apps instantly
          </div>
          <div class="feature">
            <strong>⚡ Auto-Configure CI/CD</strong><br/>
            AI generates GitHub Actions or deploys to our runners
          </div>
          <div class="feature">
            <strong>📊 Real-Time Monitoring</strong><br/>
            Ask AI about metrics, logs, and get instant insights
          </div>
          <p style="text-align: center;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" class="button">Get Started</a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  await sendEmail({
    to: email,
    subject: 'Welcome to Evolvx.AI - AI-Powered DevOps Automation',
    html,
  });
}
