const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { sessionId } = req.query;

    if (!sessionId || !sessionId.startsWith('cs_')) {
      return res.status(400).json({ error: 'Session ID no vàlid.' });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    return res.status(200).json({
      paid: session.payment_status === 'paid',
      status: session.payment_status,
      clientReferenceId: session.client_reference_id || '',
      metadata: session.metadata || {},
      customerEmail: session.customer_details?.email || session.customer_email || '',
    });

  } catch (err) {
    console.error('[verify-session]', err);
    return res.status(500).json({
      error: err.message || 'Error verificant la sessió.'
    });
  }
};