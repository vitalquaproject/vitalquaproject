'use strict';

require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const stripe  = require('stripe')(process.env.STRIPE_SECRET_KEY);

// ---------------------------------------------------------------------------
// Sanity-check: refuse to start without a real Stripe secret key
// ---------------------------------------------------------------------------
if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.startsWith('sk_test_REPLACE')) {
  console.error('[Vitalqua] ERROR: STRIPE_SECRET_KEY is not configured.');
  console.error('           Copy .env.example → .env and fill in your Stripe keys.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Firebase Admin SDK — required for server-side Firestore writes (webhook)
// ---------------------------------------------------------------------------
let admin      = null;
let db         = null;
let FieldValue = null;

const SA_PATH = path.join(__dirname, 'firebase-service-account.json');

if (process.env.FIREBASE_SERVICE_ACCOUNT || fs.existsSync(SA_PATH)) {
  try {
    admin = require('firebase-admin');
    if (!admin.apps.length) {
      const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
        ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
        : require(SA_PATH);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    db         = admin.firestore();
    FieldValue = admin.firestore.FieldValue;
    console.log('[Vitalqua] Firebase Admin SDK connected.');
  } catch (e) {
    console.warn('[Vitalqua] Firebase Admin init failed:', e.message);
    admin = null; db = null;
  }
} else {
  console.warn('[Vitalqua] firebase-service-account.json not found.');
  console.warn('           Webhook will not write to Firestore until the file is added.');
}

// ---------------------------------------------------------------------------
// Resend — optional; used to send confirmation emails from the webhook
// ---------------------------------------------------------------------------
let resend = null;

if (process.env.RESEND_API_KEY && !process.env.RESEND_API_KEY.startsWith('re_REPLACE')) {
  try {
    const { Resend } = require('resend');
    resend = new Resend(process.env.RESEND_API_KEY);
    console.log('[Vitalqua] Resend email client ready.');
  } catch (e) {
    console.warn('[Vitalqua] Resend init failed:', e.message);
  }
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
const app = express();

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map(s => s.trim());

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
}));

// ---------------------------------------------------------------------------
// POST /webhook/stripe
//
// IMPORTANT: This route must be defined BEFORE app.use(express.json()) so
// that Express does NOT parse the body as JSON. Stripe requires the raw body
// buffer to verify the webhook signature.
// ---------------------------------------------------------------------------
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig    = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret || secret.startsWith('whsec_REPLACE')) {
    console.warn('[Webhook] STRIPE_WEBHOOK_SECRET not configured — accepting without verification (dev only).');
    return res.sendStatus(200);
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    console.error('[Webhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    const m  = pi.metadata;

    const ticketId   = m.ticket_id   || pi.id;
    const nombre     = m.nombre      || '';
    const apellidos  = m.apellidos   || '';
    const telefono   = m.telefono    || '';
    const email      = m.email       || '';
    const quantity   = parseInt(m.quantity    || '1', 10);
    const finalTotal = parseFloat(m.final_total || '0');

    let guests = [];
    if (m.guests) {
      try { guests = JSON.parse(m.guests); } catch { guests = []; }
    }

    // ── Write ticket to Firestore (idempotent) ────────────────────────────
    if (db) {
      try {
        const ticketRef = db
          .collection('artifacts')
          .doc('vitalqua-show-tickets')
          .collection('public')
          .doc('data')
          .collection('tickets')
          .doc(ticketId);

        const snap = await ticketRef.get();
        if (!snap.exists) {
          await ticketRef.set({
            name:            nombre,
            surname:         apellidos,
            phone:           telefono,
            email:           email,
            quantity:        quantity,
            totalEur:        finalTotal,
            guests:          guests,
            paymentIntentId: pi.id,
            status:          'paid',
            scanned:         false,
            scanTimestamp:   null,
            createdAt:       FieldValue.serverTimestamp(),
            source:          'webhook',
          });
          console.log(`[Webhook] Ticket ${ticketId} written to Firestore.`);
        } else {
          console.log(`[Webhook] Ticket ${ticketId} already exists — skipping write.`);
        }
      } catch (err) {
        console.error('[Webhook] Firestore write error:', err);
      }
    }

    // ── Send confirmation email ───────────────────────────────────────────
    if (resend && email) {
      try {
        await sendConfirmationEmail({ ticketId, nombre, apellidos, email, quantity, finalTotal });
      } catch (err) {
        console.error('[Webhook] Email send error:', err);
      }
    }
  }

  return res.sendStatus(200);
});

// ---------------------------------------------------------------------------
// Standard JSON parsing + static file serving (after the raw-body webhook)
// ---------------------------------------------------------------------------
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ---------------------------------------------------------------------------
// Price catalogue — server-side source of truth (EUR per ticket)
// Keys match the data-amount attributes on the tier cards in show.html.
// ---------------------------------------------------------------------------
const PRICE_CATALOGUE = {
  '10':  10,
  '20':  20,
  '40':  40,
  '60':  60,
  '80':  80,
  '100': 100,
};

const MIN_TOTAL_EUR = 10;
const MAX_QUANTITY  = 20;

// ---------------------------------------------------------------------------
// POST /api/create-payment-intent
//
// Body (JSON):
//   option_id      {string}  — tier key ("10","20",…,"100","custom")
//   quantity       {number}  — number of tickets (≥ 1)
//   custom_amount  {number?} — only required when option_id === "custom"
//   metadata       {object?} — ticket_id, nombre, apellidos, telefono, email, guests
//
// Response (JSON):
//   { clientSecret: string }    — on success
//   { error: string }           — on validation / server error
// ---------------------------------------------------------------------------
app.post('/api/create-payment-intent', async (req, res) => {
  try {
    const { option_id, quantity, custom_amount, metadata = {} } = req.body;

    // ── 1. Validate option_id ──────────────────────────────────────────────
    const validOptions = [...Object.keys(PRICE_CATALOGUE), 'custom'];
    if (!option_id || !validOptions.includes(String(option_id))) {
      return res.status(400).json({ error: 'Opción de donación no válida.' });
    }

    // ── 2. Validate quantity ───────────────────────────────────────────────
    const qty = parseInt(quantity, 10);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QUANTITY) {
      return res.status(400).json({
        error: `La cantidad debe ser un número entre 1 y ${MAX_QUANTITY}.`,
      });
    }

    // ── 3. Resolve unit price ──────────────────────────────────────────────
    let unitPrice;
    if (option_id === 'custom') {
      const ca = parseFloat(custom_amount);
      if (!Number.isFinite(ca) || ca < MIN_TOTAL_EUR) {
        return res.status(400).json({
          error: `El importe personalizado mínimo es ${MIN_TOTAL_EUR} €.`,
        });
      }
      unitPrice = Math.round(ca * 100) / 100;
    } else {
      unitPrice = PRICE_CATALOGUE[option_id];
    }

    // ── 4. Business rule: final_total >= MIN_TOTAL_EUR ─────────────────────
    const finalTotal  = Math.round(unitPrice * qty * 100) / 100;
    if (finalTotal < MIN_TOTAL_EUR) {
      return res.status(400).json({
        error: `El total mínimo es ${MIN_TOTAL_EUR} €. Ajusta tu aportación.`,
      });
    }

    // ── 5. Guests field — truncate to Stripe's 500-char metadata limit ─────
    let guestsStr = '';
    if (metadata.guests) {
      guestsStr = String(metadata.guests).slice(0, 500);
    }

    // ── 6. Create Stripe PaymentIntent ─────────────────────────────────────
    const amountCents = Math.round(finalTotal * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount:   amountCents,
      currency: 'eur',
      automatic_payment_methods: { enabled: true },
      receipt_email: metadata.email || undefined,
      description: `Vitalqua Show — ${qty} entrada${qty > 1 ? 's' : ''} × ${unitPrice} €`,
      metadata: {
        event:       'show',
        ticket_id:   String(metadata.ticket_id  || ''),
        nombre:      String(metadata.nombre      || ''),
        apellidos:   String(metadata.apellidos   || ''),
        telefono:    String(metadata.telefono    || ''),
        email:       String(metadata.email       || ''),
        option_id:   String(option_id),
        quantity:    String(qty),
        unit_price:  String(unitPrice),
        final_total: String(finalTotal),
        guests:      guestsStr,
      },
    });

    return res.json({ clientSecret: paymentIntent.client_secret });

  } catch (err) {
    console.error('[Vitalqua] /api/create-payment-intent error:', err);
    const message = err.type
      ? `Error de Stripe: ${err.message}`
      : 'Error interno del servidor. Por favor inténtalo de nuevo.';
    return res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/create-checkout-session
//
// Body (JSON):
//   nom            {string}  — nom del comprador
//   cognoms        {string}
//   telefon        {string}
//   email          {string}
//   numPersones    {number}  — nombre d'entrades (≥ 1)
//   totalEur       {number}  — import total en euros (validat aquí)
//   pagamentsId    {string}  — ID del document de Firestore (client_reference_id)
//   acompanyants   {Array}   — llista d'acompanyants (opcional)
//   pricePerPerson {number}  — preu per persona (validat aquí)
//
// Response (JSON):
//   { url: string }          — URL de Stripe Hosted Checkout
//   { error: string }        — en cas d'error
// ---------------------------------------------------------------------------
app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const {
      nom, cognoms, telefon, email,
      numPersones, totalEur, pagamentsId,
      acompanyants = [], pricePerPerson,
    } = req.body;

    const qty   = parseInt(numPersones, 10);
    const price = parseFloat(pricePerPerson);
    const total = parseFloat(totalEur);

    if (!qty || qty < 1 || qty > 20) {
      return res.status(400).json({ error: 'Nombre de persones no vàlid.' });
    }
    if (!Number.isFinite(price) || price < 10) {
      return res.status(400).json({ error: 'Preu per persona no vàlid (mínim 10 €).' });
    }
    if (!pagamentsId) {
      return res.status(400).json({ error: 'Falta el ID de referència del pagament.' });
    }

    const unitAmountCents = Math.round(price * 100);

    let acompStr = '';
    try { acompStr = JSON.stringify(acompanyants).slice(0, 500); } catch { acompStr = ''; }

    const successUrl = (process.env.SUCCESS_URL || `${req.protocol}://${req.get('host')}/success-show.html`)
      .replace(/\/$/, '') + '?session_id={CHECKOUT_SESSION_ID}';
    const cancelUrl  = `${req.protocol}://${req.get('host')}/show.html?cancel=1`;

    const session = await stripe.checkout.sessions.create({
      mode:    'payment',
      line_items: [{
        price_data: {
          currency:     'eur',
          unit_amount:  unitAmountCents,
          product_data: {
            name:        'The Vitalqua Show · 16 Juliol',
            description: 'Entrada inclou consumició + picoteo + concert en directe · UIC Barcelona',
          },
        },
        quantity: qty,
      }],
      success_url:          successUrl,
      cancel_url:           cancelUrl,
      client_reference_id:  pagamentsId,
      customer_email:       email || undefined,
      metadata: {
        nom,
        cognoms,
        telefon,
        numPersones: String(qty),
        totalEur:    String(total),
        pagamentsId,
        acompanyants: acompStr,
      },
    });

    return res.json({ url: session.url });

  } catch (err) {
    console.error('[Vitalqua] /api/create-checkout-session error:', err);
    const message = err.type ? `Error de Stripe: ${err.message}` : 'Error intern del servidor.';
    return res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/verify-session/:sessionId
//
// Verifica que el payment_status d'una Checkout Session és 'paid'.
// Retorna les dades de sessió necessàries per a success-show.html.
//
// Response (JSON):
//   { paid: true,  clientReferenceId, metadata, customerEmail } — pagat
//   { paid: false, status }                                      — no pagat
//   { error: string }                                            — error
// ---------------------------------------------------------------------------
app.get('/api/verify-session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId || !sessionId.startsWith('cs_')) {
      return res.status(400).json({ error: 'Session ID no vàlid.' });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      return res.json({ paid: false, status: session.payment_status });
    }

    return res.json({
      paid:               true,
      clientReferenceId:  session.client_reference_id,
      metadata:           session.metadata,
      customerEmail:      session.customer_details?.email || '',
    });

  } catch (err) {
    console.error('[Vitalqua] /api/verify-session error:', err);
    const message = err.type ? `Error de Stripe: ${err.message}` : 'Error intern del servidor.';
    return res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// Default SPA fallback — redirect unknown paths to show.html
// ---------------------------------------------------------------------------
// app.use((req, res) => {
//   res.redirect('/show.html');
// });

// ---------------------------------------------------------------------------
// Email helper — sends confirmation HTML email via Resend
// ---------------------------------------------------------------------------
async function sendConfirmationEmail({ ticketId, nombre, apellidos, email, quantity, finalTotal }) {
  const waUrl     = process.env.WHATSAPP_INVITE_URL || 'https://chat.whatsapp.com/CnE79zheUX4K1YRTtgP14Y';
  const fromEmail = process.env.FROM_EMAIL          || 'noreply@vitalqua.org';

  const totalFmt = finalTotal.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
        Hola <strong style="color:#0F1A2E;">${nombre} ${apellidos}</strong>,<br>
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
          <td style="padding:10px 0;border-bottom:1px solid #EBF4FA;font-size:14px;color:#0F1A2E;font-weight:500;">${quantity} entrada${quantity !== 1 ? 's' : ''}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;font-size:13px;color:#6B7890;font-weight:600;">Aportación total</td>
          <td style="padding:10px 0;font-size:18px;font-weight:700;color:#2A85B3;">${totalFmt} €</td>
        </tr>
      </table>

      <!-- WhatsApp CTA -->
      <div style="background:#F0FBF5;border:1.5px solid rgba(37,211,102,.35);border-radius:14px;padding:22px 24px;margin-bottom:32px;text-align:center;">
        <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#1A5C34;">⚠️ Paso importante: únete al grupo de WhatsApp</p>
        <p style="margin:0 0 16px;font-size:13px;color:#3F4F6B;line-height:1.6;">Recibirás toda la info del evento: hora de acceso, instrucciones y sorpresas.</p>
        <a href="${waUrl}"
           style="display:inline-block;background:#25D366;color:#ffffff;font-weight:700;font-size:14px;padding:13px 32px;border-radius:999px;text-decoration:none;letter-spacing:.01em;">
          Unirme al grupo de WhatsApp
        </a>
      </div>

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
// Start
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT, 10) || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✓ Vitalqua server running  →  http://localhost:${PORT}/show.html\n`);
});
