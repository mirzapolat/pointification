// Optional outbound email. When SMTP_HOST is unset the app runs fully
// self-contained: signup skips the code and confirms the account immediately.
import nodemailer from 'nodemailer'

const host = process.env.SMTP_HOST || ''
const port = Number(process.env.SMTP_PORT || 587)
const user = process.env.SMTP_USER || ''
const pass = process.env.SMTP_PASS || ''
const from = process.env.SMTP_FROM || (user ? user : 'pointification@localhost')

export const mailEnabled = !!host

const transport = mailEnabled
  ? nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user ? { user, pass } : undefined,
    })
  : null

export async function sendVerificationCode(email, code) {
  if (!transport) return
  await transport.sendMail({
    from,
    to: email,
    subject: `${code} is your Pointification code`,
    text: `Your Pointification verification code is ${code}.\n\nIt expires in 15 minutes. If you didn't sign up, you can ignore this email.`,
    html: `<p>Your Pointification verification code is</p>
           <p style="font-size:28px;font-weight:700;letter-spacing:.2em">${code}</p>
           <p>It expires in 15 minutes. If you didn't sign up, you can ignore this email.</p>`,
  })
}
