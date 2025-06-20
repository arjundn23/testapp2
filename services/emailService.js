import nodemailer from 'nodemailer';

class EmailService {

  async sendMail(email, subject, html) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        secure: true,
        auth: {
          user: process.env.EMAIL,
          pass: process.env.EMAIL_PASSWORD,
        },
      });
    
      const mailOptions = {
        from: `Digital Portal Independents by Sodexo <${process.env.EMAIL}>`,
        to: email,
        subject: subject,
        html: html,
      };
    
      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error("Error sending email:", error);
        } else {
          console.log("Email sent successfully:", info.response);
        }
      });
      return { success: true };
    } catch (error) {
      console.error("Error sending email:", error);
      return { success: false, error };
    }
  }
}

export default new EmailService();
