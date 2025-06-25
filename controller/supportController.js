import nodemailer from 'nodemailer';
import asyncHandler from 'express-async-handler';
import dotenv from 'dotenv';

dotenv.config();

// @desc    Send support email
// @route   POST /api/support
// @access  Private
const sendSupportEmail = asyncHandler(async (req, res) => {
  const { name, email, subject, message } = req.body;
  
  // Validate input
  if (!name || !email || !subject || !message) {
    res.status(400);
    throw new Error('Please fill in all fields');
  }

  try {
    // Create transporter
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'mail.serendipityint.co.uk',
      port: process.env.SMTP_PORT || 465,
      secure: true, // Use SSL
      auth: {
        user: process.env.EMAIL || 'dev@serendipityint.co.uk',
        pass: process.env.EMAIL_PASSWORD || 'k[25UicqQ[n}',
      },
    });

    // Support email content
    const supportEmailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #C95C34;">New Support Request</h2>
        <p><strong>From:</strong> ${name} (${email})</p>
        <p><strong>Subject:</strong> ${subject}</p>
        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin-top: 20px;">
          <p><strong>Message:</strong></p>
          <p>${message.replace(/\n/g, '<br>')}</p>
        </div>
        <p style="margin-top: 20px; font-size: 12px; color: #666;">
          This message was sent from the Resource Portal support form.
        </p>
      </div>
    `;

    // Send email
    const info = await transporter.sendMail({
      from: `"Resource Portal" <${process.env.EMAIL || 'dev@serendipityint.co.uk'}>`,
      to: process.env.SUPPORT_EMAIL || 'dev@serendipityint.co.uk',
      subject: `Support Request: ${subject}`,
      html: supportEmailContent,
    });

    // Send confirmation email to user
    // const userConfirmationEmail = `
    //   <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    //     <h2 style="color: #C95C34;">Support Request Received</h2>
    //     <p>Dear ${name},</p>
    //     <p>Thank you for contacting our support team. We have received your request and will get back to you as soon as possible.</p>
    //     <p><strong>Request Details:</strong></p>
    //     <ul>
    //       <li><strong>Subject:</strong> ${subject}</li>
    //       <li><strong>Date Submitted:</strong> ${new Date().toLocaleString()}</li>
    //     </ul>
    //     <p>If you have any additional information to add to your request, please reply to this email.</p>
    //     <p>Best regards,<br>Resource Portal Support Team</p>
    //   </div>
    // `;

    // await transporter.sendMail({
    //   from: `"Resource Portal Support" <${process.env.SMTP_USER}>`,
    //   to: email,
    //   subject: 'Your Support Request Has Been Received',
    //   html: userConfirmationEmail,
    // });

    res.status(200).json({ success: true, message: 'Support request sent successfully' });
  } catch (error) {
    console.error('Support email error:', error);
    res.status(500);
    throw new Error('Failed to send support request. Please try again.');
  }
});

export { sendSupportEmail };
