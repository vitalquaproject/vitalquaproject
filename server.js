'use strict';

require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const stripe  = require('stripe')(process.env.STRIPE_SECRET_KEY);

// ---------------------------------------------------------------------------
// Sanity-check: refuse to start without a real Stripe secret key
// ---------------------------------------------------------------------------
if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.startsWith('sk_test_REPLACE')) {
  console.error('[Vitalqua] ERROR: STRIPE_SECRET_KEY is not configured.');
  console.error('           Copy .env.example → .env and fill in your Stripe keys.');
  process.exit(1);
}

const app = express();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map(s => s.trim());

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (e.g. curl, same-origin redirects)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
}));

app.use(express.json());

// Serve static files (HTML, CSS, JS, images)
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
  // 'custom' is handled separately — unit price comes from custom_amount field
};

const MIN_TOTAL_EUR = 10;
const MAX_QUANTITY  = 20; // sensible upper bound

// ---------------------------------------------------------------------------
// POST /api/create-payment-intent
//
// Body (JSON):
//   option_id      {string}  — tier key ("10","20",…,"100","custom")
//   quantity       {number}  — number of tickets (≥ 1)
//   custom_amount  {number?} — only required when option_id === "custom"
//   metadata       {object?} — ticket_id, nombre, apellidos, telefono, email
//
// Response (JSON):
//   { clientSecret: string }         — on success
//   { error: string }                — on validation / server error
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
      // Round to 2 decimal places to avoid floating-point surprises
      unitPrice = Math.round(ca * 100) / 100;
    } else {
      unitPrice = PRICE_CATALOGUE[option_id];
    }

    // ── 4. Apply business rule: final_total >= MIN_TOTAL_EUR ───────────────
    const finalTotal = Math.round(unitPrice * qty * 100) / 100; // keep 2dp

    if (finalTotal < MIN_TOTAL_EUR) {
      return res.status(400).json({
        error: `El total mínimo es ${MIN_TOTAL_EUR} €. Ajusta tu aportación.`,
      });
    }

    // ── 5. Create Stripe PaymentIntent ─────────────────────────────────────
    // Stripe amounts are always in the smallest currency unit (cents for EUR)
    const amountCents = Math.round(finalTotal * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount:   amountCents,
      currency: 'eur',
      automatic_payment_methods: { enabled: true },
      receipt_email: metadata.email || undefined,
      description: `Vitalqua Show — ${qty} entrada${qty > 1 ? 's' : ''} × ${unitPrice} €`,
      metadata: {
        ticket_id:   String(metadata.ticket_id  || ''),
        nombre:      String(metadata.nombre      || ''),
        apellidos:   String(metadata.apellidos   || ''),
        telefono:    String(metadata.telefono    || ''),
        email:       String(metadata.email       || ''),
        option_id:   String(option_id),
        quantity:    String(qty),
        unit_price:  String(unitPrice),
        final_total: String(finalTotal),
      },
    });

    return res.json({ clientSecret: paymentIntent.client_secret });

  } catch (err) {
    console.error('[Vitalqua] /api/create-payment-intent error:', err);

    // Surface Stripe-specific messages to aid debugging; keep generic in prod
    const message = err.type
      ? `Error de Stripe: ${err.message}`
      : 'Error interno del servidor. Por favor inténtalo de nuevo.';

    return res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// Default SPA fallback — redirect unknown paths to show.html
// ---------------------------------------------------------------------------
app.use((req, res) => {
  res.redirect('/show.html');
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT, 10) || 3000;
app.listen(PORT, '127.0.0.1', () => {
  console.log(`\n✓ Vitalqua server running  →  http://localhost:${PORT}/show.html\n`);
});
