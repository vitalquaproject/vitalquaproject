const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    )
  });
}

const db = admin.firestore();

// ---------------------------------------------------------------------------
// Resend — sends confirmation email when payment is confirmed
// ---------------------------------------------------------------------------
let resend = null;
if (process.env.RESEND_API_KEY && !process.env.RESEND_API_KEY.startsWith('re_REPLACE')) {
  try {
    const { Resend } = require('resend');
    resend = new Resend(process.env.RESEND_API_KEY);
  } catch (e) {
    console.warn('[Webhook] Resend init failed:', e.message);
  }
}

// ---------------------------------------------------------------------------
// Helper: buffer readable stream (needed for raw body / Stripe signature)
// ---------------------------------------------------------------------------
const buffer = async (readable) => {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
};

// ---------------------------------------------------------------------------
// Helper: send HTML confirmation email via Resend
// ---------------------------------------------------------------------------
async function sendConfirmationEmail({ ticketId, nom, cognoms, email, numPersones, totalEur }) {
  const fromEmail = process.env.FROM_EMAIL || 'noreply@vitalqua.org';

  const qty      = parseInt(numPersones, 10) || 1;
  const total    = parseFloat(totalEur)      || 0;
  const totalFmt = total.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Entrada confirmada — The Vitalqua Show</title>
</head>
<body style="font-family:Inter,system-ui,sans-serif;background:#F0F4F8;margin:0;padding:32px 16px;">
  <div style="max-width:540px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(15,26,46,.10);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#0F1A2E 0%,#1B4F72 100%);padding:40px 36px 32px;text-align:center;">
      <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:#4FB3D9;">The Vitalqua Show · 16 Julio 2026</p>
      <h1 style="margin:0;font-size:28px;font-weight:700;color:#ffffff;line-height:1.2;">¡Tu entrada está confirmada!</h1>
      <p style="margin:14px 0 0;font-size:15px;color:rgba(163,208,227,.85);">Gracias por apoyar el acceso al agua limpia en Kenia</p>
    </div>

    <!-- Body -->
    <div style="padding:36px;">

      <p style="margin:0 0 24px;font-size:15px;color:#3F4F6B;line-height:1.65;">
        Hola <strong style="color:#0F1A2E;">${nom} ${cognoms}</strong>,<br>
        hemos registrado tu aportación con éxito. ¡Te esperamos en el evento!
      </p>

      <!-- Ticket ID card -->
      <div style="background:#F5F9FC;border:2px dashed #A3D0E3;border-radius:14px;padding:20px 24px;margin-bottom:24px;text-align:center;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#6B7890;">Tu ID de entrada</p>
        <p style="margin:0;font-size:28px;font-weight:700;letter-spacing:.12em;color:#0F1A2E;font-family:'Courier New',monospace;">${ticketId}</p>
        <p style="margin:8px 0 0;font-size:12px;color:#9EAEC0;">Guarda este ID — lo necesitarás en la puerta</p>
      </div>

      <!-- Event details table -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #EBF4FA;font-size:13px;color:#6B7890;font-weight:600;width:42%;">Evento</td>
          <td style="padding:10px 0;border-bottom:1px solid #EBF4FA;font-size:14px;color:#0F1A2E;font-weight:500;">The Vitalqua Show</td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #EBF4FA;font-size:13px;color:#6B7890;font-weight:600;">Fecha y hora</td>
          <td style="padding:10px 0;border-bottom:1px solid #EBF4FA;font-size:14px;color:#0F1A2E;font-weight:500;">16 de julio de 2026 · 19:00–23:00 h</td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #EBF4FA;font-size:13px;color:#6B7890;font-weight:600;">Lugar</td>
          <td style="padding:10px 0;border-bottom:1px solid #EBF4FA;font-size:14px;color:#0F1A2E;font-weight:500;">UIC Barcelona</td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #EBF4FA;font-size:13px;color:#6B7890;font-weight:600;">Entradas</td>
          <td style="padding:10px 0;border-bottom:1px solid #EBF4FA;font-size:14px;color:#0F1A2E;font-weight:500;">${qty} entrada${qty !== 1 ? 's' : ''}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;font-size:13px;color:#6B7890;font-weight:600;">Aportación total</td>
          <td style="padding:10px 0;font-size:18px;font-weight:700;color:#2A85B3;">${totalFmt} €</td>
        </tr>
      </table>

      <!-- Footer note -->
      <p style="margin:0;font-size:12px;color:#A3B5CD;text-align:center;line-height:1.7;">
        ¿Tienes alguna pregunta?<br>
        Escríbenos a <a href="mailto:vitalquaproject@gmail.com" style="color:#2A85B3;text-decoration:none;">vitalquaproject@gmail.com</a>
      </p>

    </div>
  </div>
</body>
</html>`;

  await resend.emails.send({
    from:    `The Vitalqua Show <${fromEmail}>`,
    to:      [email],
    subject: `🎟️ Entrada confirmada · ${ticketId} · The Vitalqua Show`,
    html,
  });

  console.log(`[Webhook] Confirmation email sent to ${email} (ticket ${ticketId}).`);
}

// ---------------------------------------------------------------------------
// Serverless handler
// ---------------------------------------------------------------------------
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const rawBody = await buffer(req);
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('[Webhook] Signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session     = event.data.object;
    const pagamentsId = session.client_reference_id;
    const meta        = session.metadata || {};

    console.log('[Webhook] Pago confirmado:', pagamentsId);

    // ── Update Firestore ──────────────────────────────────────────────────
    try {
      await db.collection('pagaments-show').doc(pagamentsId).update({
        status:          'paid',
        stripeSessionId: session.id,
        paidAt:          admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`[Webhook] Firestore updated for ${pagamentsId}.`);
    } catch (err) {
      console.error('[Webhook] Firestore error:', err);
    }

    // ── Send confirmation email via Resend ────────────────────────────────
    const email = meta.email || session.customer_email || session.customer_details?.email || '';
    if (resend && email) {
      try {
        await sendConfirmationEmail({
          ticketId:   pagamentsId,
          nom:        meta.nom      || '',
          cognoms:    meta.cognoms  || '',
          email,
          numPersones: meta.numPersones || '1',
          totalEur:    meta.totalEur    || '0',
        });
      } catch (err) {
        console.error('[Webhook] Email error:', err);
      }
    } else if (!resend) {
      console.warn('[Webhook] Resend not configured — email not sent.');
    } else {
      console.warn('[Webhook] No email address found in session — email not sent.');
    }
  }

  return res.json({ received: true });
};

// ---------------------------------------------------------------------------
// Vercel config — disable body parser so we can read raw body for Stripe
// ---------------------------------------------------------------------------
module.exports.config = {
  api: {
    bodyParser: false,
  },
};
