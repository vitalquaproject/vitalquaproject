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

export const config = {
  api: {
    bodyParser: false, // 🔥 NECESARIO para Stripe
  },
};


export default async function handler(req, res) {
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
    console.error('❌ Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // 💥 EVENTO IMPORTANTE
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    const pagamentsId = session.client_reference_id;

    console.log('✅ Pago confirmado:', pagamentsId);

    try {
      await db.collection('pagaments-show').doc(pagamentsId).update({
        status: 'paid',
        stripeSessionId: session.id,
        paidAt: admin.firestore.FieldValue.serverTimestamp()
      });

    } catch (err) {
      console.error('❌ Error actualizando Firestore:', err);
    }
  }

  res.json({ received: true });
};


// helper para Vercel
const buffer = async (readable) => {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
};