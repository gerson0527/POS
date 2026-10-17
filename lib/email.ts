import nodemailer from 'nodemailer'

// Seguridad (H-9): escapar valores interpolados en el HTML del correo.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export async function sendWelcomeEmail(to: string, name: string, role: string = 'OPERADOR') {
  const smtpHost = process.env.SMTP_HOST
  const smtpPort = parseInt(process.env.SMTP_PORT || '587')
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASSWORD
  const smtpFrom = process.env.SMTP_FROM || 'POS DIAN Colombia <notificaciones@posdian.co>'

  const subject = 'Bienvenido a POS DIAN'
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: monospace, Arial, sans-serif; background-color: #0B0B0B; color: #EEEEEE; margin: 0; padding: 20px; }
          .container { background-color: #141414; border: 1px solid #FF6A00; border-radius: 8px; max-width: 600px; margin: 0 auto; padding: 30px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
          .header { border-bottom: 2px solid #FF6A00; padding-bottom: 15px; margin-bottom: 20px; }
          .title { color: #FF6A00; font-size: 20px; font-weight: bold; margin: 0; text-transform: uppercase; letter-spacing: 1px; }
          .subtitle { color: #8C8C8C; font-size: 11px; margin-top: 5px; text-transform: uppercase; }
          .content { font-size: 13px; line-height: 1.6; color: #B0B0B0; }
          .box { background-color: #0E0E0E; border: 1px solid #303030; border-left: 4px solid #FF6A00; padding: 15px; border-radius: 6px; margin: 20px 0; }
          .field { margin: 6px 0; font-size: 12px; }
          .label { color: #8C8C8C; font-weight: bold; }
          .value { color: #FFFFFF; font-weight: bold; }
          .btn { display: inline-block; background-color: #FF6A00; color: #000000; font-weight: bold; text-decoration: none; padding: 12px 24px; border-radius: 4px; font-size: 12px; text-transform: uppercase; margin-top: 15px; }
          .footer { font-size: 10px; color: #666666; text-align: center; margin-top: 30px; border-top: 1px solid #222222; padding-top: 15px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="title">Bienvenido a POS DIAN</div>
            <div class="subtitle">Confirmación de cuenta de acceso y rol</div>
          </div>
          <div class="content">
            <p>Hola <strong style="color: #FFFFFF;">${escapeHtml(name)}</strong>,</p>
            <p>Tu cuenta ha sido creada exitosamente en la plataforma de Facturación Electrónica POS DIAN Colombia.</p>
            <div class="box">
              <div class="field"><span class="label">CORREO ELECTRÓNICO:</span> <span class="value">${escapeHtml(to)}</span></div>
              <div class="field"><span class="label">ROL ASIGNADO:</span> <span class="value" style="color: #FF6A00;">${escapeHtml(role.toUpperCase())}</span></div>
              <div class="field"><span class="label">ESTADO DE CUENTA:</span> <span class="value" style="color: #D8FFDE;">Activa</span></div>
            </div>
            <p>Puedes ingresar al sistema y comenzar a operar tu caja registradora o panel de control:</p>
            <div style="text-align: center;">
              <a href="${appUrl}/login" class="btn">Ingresar al sistema</a>
            </div>
          </div>
          <div class="footer">
            SISTEMA POS RETAIL & FACTURACIÓN ELECTRÓNICA DIAN • REGISTRO AUTOMÁTICO DE USUARIOS
          </div>
        </div>
      </body>
    </html>
  `

  console.log(`\n======================================================`)
  console.log(`[EMAIL AUTOMATED DISPATCH] NOTIFICACIÓN DE NUEVO USUARIO`)
  console.log(`DESTINATARIO: ${to}`)
  console.log(`USUARIO: ${name} (${role})`)
  console.log(`======================================================\n`)

  if (smtpHost && smtpUser && smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
      })

      await transporter.sendMail({
        from: smtpFrom,
        to,
        subject,
        html,
      })
      console.log(`[SMTP SUCCESS] Correo enviado a ${to}`)
      return { success: true }
    } catch (err) {
      console.error(`[SMTP ERROR] No se pudo enviar correo SMTP a ${to}:`, err)
      return { success: false, error: err }
    }
  }

  return { success: true, simulated: true }
}
