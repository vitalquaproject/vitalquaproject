const admin      = require('firebase-admin');
const nodemailer = require('nodemailer');

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
// Helper: build confirmation email HTML (shared template)
// ---------------------------------------------------------------------------
function buildEmailHtml({ nom, cognoms, numPersones, totalEur, acompanyants = [] }) {
  const qty            = parseInt(numPersones, 10) || 1;
  const total          = parseFloat(totalEur)      || 0;
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
// Serverless handler — backup email endpoint called from success-show.html
// ---------------------------------------------------------------------------
module.exports = async function handler(req, res) {
  // Allow CORS preflight from the same origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { pagamentsId } = req.body || {};
  if (!pagamentsId) {
    return res.status(400).json({ error: 'Falta pagamentsId' });
  }

  try {
    const docRef = db.collection('pagaments-show').doc(pagamentsId);
    const doc    = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Document no trobat' });
    }

    const data = doc.data();

    // Idempotència: si el webhook ja va enviar l'email no el tornem a enviar
    if (data.emailSent === true) {
      console.log(`[send-email] Email ja enviat per al webhook (${pagamentsId}), s'omet.`);
      return res.json({ sent: false, reason: 'already_sent' });
    }

    const email = data.email || '';
    if (!email) {
      return res.status(400).json({ error: 'No hi ha email al document de Firestore' });
    }

    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASSWORD;

    if (!gmailUser || !gmailPass) {
      return res.status(500).json({ error: 'Gmail env vars not configured' });
    }

    let acompanyants = [];
    try { acompanyants = JSON.parse(data.acompanyants || '[]'); } catch { /* empty */ }

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
      html:    buildEmailHtml({
        nom:         data.nom         || '',
        cognoms:     data.cognoms     || '',
        numPersones: data.numPersones || '1',
        totalEur:    data.totalEur    || '0',
        acompanyants,
      }),
    });

    // Marca com a enviat per evitar futurs duplicats
    await docRef.update({ emailSent: true });

    console.log(`[send-email] Email de backup enviat a ${email} (${pagamentsId}).`);
    return res.json({ sent: true });

  } catch (err) {
    console.error('[send-email] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
