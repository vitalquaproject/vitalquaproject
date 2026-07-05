const Stripe     = require('stripe');
const stripe     = new Stripe(process.env.STRIPE_SECRET_KEY);
const getRawBody = require('raw-body');
const nodemailer = require('nodemailer');
const admin      = require('firebase-admin');

// ---------------------------------------------------------------------------
// Firebase Admin SDK (singleton)
// ---------------------------------------------------------------------------
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    ),
  });
}
const db = admin.firestore();

// ---------------------------------------------------------------------------
// Helper: read raw body — handles both stream and pre-buffered Vercel runtimes
// ---------------------------------------------------------------------------
async function readRawBody(req) {
  // Newer Vercel runtimes may pre-buffer the body as a Buffer on req.body
  if (Buffer.isBuffer(req.body)) {
    return req.body;
  }

  // Standard: body is a readable stream (default for plain Node.js serverless)
  const buf = await getRawBody(req, {
    length:   req.headers['content-length'],
    limit:    '1mb',
    encoding: false,   // always return a Buffer, never a string
  });

  return buf;
}

// ---------------------------------------------------------------------------
// Helper: build confirmation email HTML
// ---------------------------------------------------------------------------
function buildEmailHtml({ nom, cognoms, numPersones, totalEur, acompanyants = [] }) {
  const qty          = parseInt(numPersones, 10) || 1;
  const total        = parseFloat(totalEur)      || 0;
  const pricePerPerson = total / qty;

  function fmtPrice(val) {
    return val.toLocaleString('ca-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '&nbsp;&euro;';
  }

  const titularRow =
    '<tr style="border-bottom:1px solid #EBF4FA">' +
      '<td style="padding:10px 12px;font-size:13px;color:#6B7890;white-space:nowrap">Titular</td>' +
      '<td style="padding:10px 12px;font-size:13px;color:#0F1A2E;font-weight:600">' + nom + ' ' + cognoms + '</td>' +
      '<td style="padding:10px 12px;font-size:13px;color:#2A85B3;font-weight:600;text-align:right;white-space:nowrap">' + fmtPrice(pricePerPerson) + '</td>' +
    '</tr>';

  let acompRows = '';
  acompanyants.forEach(function (a, i) {
    const isLast = (i === acompanyants.length - 1);
    acompRows +=
      '<tr' + (isLast ? '' : ' style="border-bottom:1px solid #EBF4FA"') + '>' +
        '<td style="padding:10px 12px;font-size:13px;color:#6B7890;white-space:nowrap">Acomp. ' + (i + 1) + '</td>' +
        '<td style="padding:10px 12px;font-size:13px;color:#0F1A2E;font-weight:500">' + (a.nom || a.name || '') + '</td>' +
        '<td style="padding:10px 12px;font-size:13px;color:#2A85B3;font-weight:600;text-align:right;white-space:nowrap">' + fmtPrice(pricePerPerson) + '</td>' +
      '</tr>';
  });

  const totalRow =
    '<tr style="background:#EBF4FA">' +
      '<td colspan="2" style="padding:12px 12px;font-size:14px;font-weight:700;color:#0F1A2E">TOTAL</td>' +
      '<td style="padding:12px 12px;font-size:16px;font-weight:800;color:#1B5F85;text-align:right;white-space:nowrap">' +
        total.toLocaleString('ca-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '&nbsp;&euro;' +
      '</td>' +
    '</tr>';

  return (
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:0 auto;background:#F5F9FC">' +
    '<div style="background:linear-gradient(135deg,#0D1E38 0%,#1B5F85 100%);padding:28px 32px 24px;border-radius:16px 16px 0 0">' +
      '<h1 style="margin:0 0 6px;font-size:22px;font-weight:800;color:#ffffff;line-height:1.2">Reserva confirmada &#10003;</h1>' +
      '<p style="margin:0;font-size:13px;color:rgba(163,208,227,.85)">Concert Ben&egrave;fic &middot; 16 de Juliol &middot; UIC Barcelona</p>' +
    '</div>' +
    '<div style="background:#ffffff;padding:28px 32px;border:1px solid #D6EEF6;border-top:none">' +
      '<p style="margin:0 0 22px;font-size:15px;line-height:1.65;color:#3F4F6B">' +
        'Hola <strong style="color:#0F1A2E">' + nom + ' ' + cognoms + '</strong>,<br><br>' +
        'La teva inscripci&oacute; al <strong style="color:#0F1A2E">Concert Ben&egrave;fic Vitalqua</strong> ha estat confirmada. ' +
        'T\'esperem el <strong style="color:#0F1A2E">16 de Juliol</strong> a les <strong style="color:#0F1A2E">19:00h</strong> a <strong style="color:#0F1A2E">UIC Barcelona</strong>.' +
      '</p>' +
      '<div style="border:1px solid #D6EEF6;border-radius:12px;overflow:hidden;margin-bottom:20px">' +
        '<div style="background:#EBF4FA;padding:10px 12px">' +
          '<p style="margin:0;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#6B7890">Assistents i preus</p>' +
        '</div>' +
        '<table style="width:100%;border-collapse:collapse">' +
          '<thead><tr style="border-bottom:2px solid #D6EEF6">' +
            '<th style="padding:8px 12px;font-size:11px;font-weight:700;color:#A3B5CD;text-align:left;letter-spacing:.1em;text-transform:uppercase">Rol</th>' +
            '<th style="padding:8px 12px;font-size:11px;font-weight:700;color:#A3B5CD;text-align:left;letter-spacing:.1em;text-transform:uppercase">Nom</th>' +
            '<th style="padding:8px 12px;font-size:11px;font-weight:700;color:#A3B5CD;text-align:right;letter-spacing:.1em;text-transform:uppercase">Preu</th>' +
          '</tr></thead>' +
          '<tbody>' + titularRow + acompRows + '</tbody>' +
          '<tfoot>' + totalRow + '</tfoot>' +
        '</table>' +
      '</div>' +
      '<p style="margin:0;font-size:13px;line-height:1.7;color:#6B7890">' +
        'El 100% del preu de la teva entrada va directament al projecte d\'aigua neta per a 500 estudiants a Narok, Kenya. ' +
        'Gr&agrave;cies per fer possible aquest projecte. &#128149;' +
      '</p>' +
    '</div>' +
    '<div style="padding:14px 32px;border:1px solid #D6EEF6;border-top:none;border-radius:0 0 16px 16px;background:#F5F9FC">' +
      '<p style="margin:0;font-size:12px;color:#A3B5CD">' +
        'Vitalqua Project &middot; <a href="mailto:vitalquaproject@gmail.com" style="color:#A3B5CD;text-decoration:none">vitalquaproject@gmail.com</a>' +
      '</p>' +
    '</div>' +
    '</div>'
  );
}

// ---------------------------------------------------------------------------
// Helper: send confirmation email via Nodemailer + Gmail SMTP
// ---------------------------------------------------------------------------
async function sendConfirmationEmail({ nom, cognoms, email, numPersones, totalEur, acompanyants }) {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;

  if (!gmailUser || !gmailPass) {
    throw new Error('Gmail env vars not configured (GMAIL_USER, GMAIL_APP_PASSWORD).');
  }

  const transporter = nodemailer.createTransport({
    host:   'smtp.gmail.com',
    port:   465,
    secure: true,
    auth: { user: gmailUser, pass: gmailPass },
  });

  await transporter.sendMail({
    from:    `Concert Benèfic Vitalqua <${gmailUser}>`,
    to:      email,
    subject: 'Reserva confirmada ✓ · Concert Benèfic Vitalqua',
    html:    buildEmailHtml({ nom, cognoms, numPersones, totalEur, acompanyants }),
  });

  console.log(`[Webhook] Email de confirmació enviat a ${email}.`);
}

// ---------------------------------------------------------------------------
// Serverless handler
// ---------------------------------------------------------------------------
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  if (!sig) {
    console.error('[Webhook] Manca la capçalera stripe-signature');
    return res.status(400).send('Missing stripe-signature header');
  }

  // ── Read raw body ─────────────────────────────────────────────────────────
  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (err) {
    console.error('[Webhook] Error llegint el body:', err.message);
    return res.status(400).send(`Body read error: ${err.message}`);
  }

  if (!rawBody || rawBody.length === 0) {
    console.error('[Webhook] Body buit rebut de Stripe');
    return res.status(400).send('Empty body');
  }

  // ── Verify Stripe signature ───────────────────────────────────────────────
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('[Webhook] Error de signatura:', err.message);
    console.error('[Webhook] Body length:', rawBody.length, 'sig prefix:', sig.slice(0, 40));
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('[Webhook] Event verificat:', event.type, event.id);

  // ── Handle checkout.session.completed ────────────────────────────────────
  if (event.type === 'checkout.session.completed') {
    const session     = event.data.object;
    const pagamentsId = session.client_reference_id;
    const meta        = session.metadata || {};

    console.log('[Webhook] Pagament confirmat, pagamentsId:', pagamentsId);

    // Update Firestore
    try {
      await db.collection('pagaments-show').doc(pagamentsId).update({
        status:          'paid',
        stripeSessionId: session.id,
        paidAt:          admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`[Webhook] Firestore actualitzat per ${pagamentsId}.`);
    } catch (err) {
      console.error('[Webhook] Error Firestore:', err.message);
    }

    // Send confirmation email
    const email =
      meta.email ||
      session.customer_email ||
      session.customer_details?.email ||
      '';

    if (!email) {
      console.warn('[Webhook] Sense adreça email — email no enviat.');
    } else {
      let acompanyants = [];
      try { acompanyants = JSON.parse(meta.acompanyants || '[]'); } catch { /* empty */ }

      try {
        await sendConfirmationEmail({
          nom:         meta.nom         || '',
          cognoms:     meta.cognoms     || '',
          email,
          numPersones: meta.numPersones || '1',
          totalEur:    meta.totalEur    || '0',
          acompanyants,
        });
        // Marca emailSent perquè success-show.html no enviï un duplicat
        await db.collection('pagaments-show').doc(pagamentsId).update({ emailSent: true });
      } catch (err) {
        console.error('[Webhook] Error enviant email:', err.message);
        // No marquem emailSent → success-show.html activarà el backup
      }
    }
  }

  return res.json({ received: true });
};
