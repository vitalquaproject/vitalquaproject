const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      nom,
      cognoms,
      telefon,
      email,
      numPersones,
      totalEur,
      pagamentsId,
      acompanyants = []
    } = req.body;

    if (!email || !pagamentsId || !totalEur || !numPersones) {
      return res.status(400).json({ error: 'Falten dades obligatòries.' });
    }

    const amountCents = Math.round(Number(totalEur) * 100);

    if (!Number.isFinite(amountCents) || amountCents < 1000) {
      return res.status(400).json({ error: 'Import no vàlid.' });
    }

    const baseUrl =
      process.env.PUBLIC_BASE_URL ||
      `https://${req.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email,
      client_reference_id: pagamentsId,

      line_items: [
        {
          price_data: {
            currency: 'eur',
            unit_amount: amountCents,
            product_data: {
              name: 'Concert Benèfic Vitalqua',
              description: `${numPersones} persona/es · The Vitalqua Show`
            }
          },
          quantity: 1
        }
      ],

      success_url: `${baseUrl}/success-show.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/show.html?cancel=1`,

      metadata: {
        pagamentsId,
        nom,
        cognoms,
        telefon,
        email,
        numPersones: String(numPersones),
        totalEur: String(totalEur),
        acompanyants: JSON.stringify(acompanyants).slice(0, 500)
      }
    });

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error('[create-checkout-session]', err);
    return res.status(500).json({
      error: 'Error creant la sessió de pagament.'
    });
  }
};