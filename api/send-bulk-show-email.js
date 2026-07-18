const admin = require('firebase-admin');

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

// Flip to true when the template is ready and we want real sends.
const SEND_ENABLED = false;

const SITE_BASE =
  process.env.PUBLIC_BASE_URL || 'https://vitalquaproject.vercel.app';

const FOTOS_URL = SITE_BASE.replace(/\/$/, '') + '/fotos-show.html';
const DONACIO_URL =
  'https://www.migranodearena.org/reto/agua-y-educacion-para-kenia-construyendo-el-futuro-de-emorogi';

const DEFAULT_SUBJECT = 'Gràcies per venir 💙 · Vitalqua Show';

// ---------------------------------------------------------------------------
// Bulk thank-you email (titulars)
// ---------------------------------------------------------------------------
function buildBulkEmailHtml({ nom, cognoms }) {
  const name = [nom, cognoms].filter(Boolean).join(' ').trim() || 'hola';
  const btn =
    'display:inline-block;padding:13px 24px;border-radius:999px;' +
    'font-size:14px;font-weight:700;text-decoration:none;';

  return (
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:0 auto;background:#F5F9FC">' +
    '<div style="background:linear-gradient(135deg,#0D1E38 0%,#1B5F85 100%);padding:28px 32px 24px;border-radius:16px 16px 0 0">' +
      '<h1 style="margin:0 0 6px;font-size:22px;font-weight:800;color:#ffffff;line-height:1.2">Quina nit! &#128149;</h1>' +
      '<p style="margin:0;font-size:13px;color:rgba(163,208,227,.85)">Vitalqua Show</p>' +
    '</div>' +
    '<div style="background:#ffffff;padding:28px 32px;border:1px solid #D6EEF6;border-top:none">' +
      '<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#3F4F6B">' +
        'Hola <strong style="color:#0F1A2E">' + escapeHtml(name) + '</strong>,' +
      '</p>' +
      '<p style="margin:0 0 22px;font-size:15px;line-height:1.65;color:#3F4F6B">' +
        'Gr&agrave;cies per venir al <strong style="color:#0F1A2E">Vitalqua Show</strong>. ' +
        'Vam passar una nit genial &mdash; i vosaltres en vau ser una part molt important. &#10024;' +
      '</p>' +
      '<div style="background:#EBF4FA;border:1px solid #D6EEF6;border-radius:14px;padding:18px 16px;margin:0 0 22px;text-align:center">' +
        '<p style="margin:0 0 6px;font-size:22px;line-height:1">&#128247;</p>' +
        '<p style="margin:0 0 14px;font-size:14px;line-height:1.5;color:#3F4F6B">' +
          'Les fotos de la festa ja estan aqu&iacute;. Vine a buscar-te!' +
        '</p>' +
        '<a href="' + FOTOS_URL + '" style="' + btn + 'background:#1B5F85;color:#ffffff">&#128247;&nbsp; Veure les fotos</a>' +
      '</div>' +
      '<div style="background:#FFF8F0;border:1px solid #F0E0CC;border-radius:14px;padding:18px 16px;margin:0 0 8px;text-align:center">' +
        '<p style="margin:0 0 6px;font-size:22px;line-height:1">&#127757;</p>' +
        '<p style="margin:0 0 14px;font-size:14px;line-height:1.5;color:#3F4F6B">' +
          'Si et ve de gust, pots seguir sumant amb una donaci&oacute; petita (o no tan petita &#128521;) a Kenya:' +
        '</p>' +
        '<a href="' + DONACIO_URL + '" style="' + btn + 'background:#ffffff;color:#1B5F85;border:2px solid #1B5F85">&#10084;&#65039;&nbsp; Donar a migranodearena</a>' +
      '</div>' +
      '<p style="margin:22px 0 0;font-size:14px;line-height:1.65;color:#6B7890">' +
        'Una abra&ccedil;ada gran,<br><strong style="color:#0F1A2E">L\'equip Vitalqua</strong> &#128153;' +
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

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function expectedAdminPassword() {
  return process.env.ADMIN_PASSWORD || process.env.ADMIN_BULK_EMAIL_PASSWORD || 'marki';
}

async function loadTitularRecipients() {
  const snap = await db.collection('pagaments-show')
    .where('status', '==', 'paid')
    .get();

  const byEmail = new Map();

  snap.docs.forEach((doc) => {
    const data = doc.data() || {};
    const email = String(data.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) return;

    if (!byEmail.has(email)) {
      byEmail.set(email, {
        email,
        nom: data.nom || '',
        cognoms: data.cognoms || '',
        pagamentsIds: [doc.id],
      });
    } else {
      byEmail.get(email).pagamentsIds.push(doc.id);
    }
  });

  return Array.from(byEmail.values()).sort((a, b) =>
    a.email.localeCompare(b.email, 'ca')
  );
}

// ---------------------------------------------------------------------------
// Serverless handler
// ---------------------------------------------------------------------------
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const password = body.password || '';
  const wantSend = body.send === true;
  const testEmail = String(body.testEmail || '').trim().toLowerCase();

  if (password !== expectedAdminPassword()) {
    return res.status(401).json({ error: 'No autoritzat' });
  }

  // Test send: always allowed (even while SEND_ENABLED === false) because it
  // only ever reaches the single address the admin typed in, never the
  // real recipient list.
  if (testEmail) {
    if (!testEmail.includes('@')) {
      return res.status(400).json({ error: 'Email de prova no vàlid' });
    }

    try {
      const nodemailer = require('nodemailer');
      const gmailUser = process.env.GMAIL_USER;
      const gmailPass = process.env.GMAIL_APP_PASSWORD;

      if (!gmailUser || !gmailPass) {
        return res.status(500).json({ error: 'Gmail env vars not configured (GMAIL_USER, GMAIL_APP_PASSWORD)' });
      }

      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: gmailUser, pass: gmailPass },
      });

      await transporter.sendMail({
        from: `Vitalqua Show <${gmailUser}>`,
        to: testEmail,
        subject: '[PROVA] ' + DEFAULT_SUBJECT,
        html: buildBulkEmailHtml({ nom: 'Prova', cognoms: '' }),
      });

      return res.json({ testSent: true, to: testEmail, message: `Email de prova enviat a ${testEmail}.` });
    } catch (err) {
      console.error('[send-bulk-show-email] Test send error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  try {
    const recipients = await loadTitularRecipients();

    const preview = {
      dryRun: true,
      sendEnabled: SEND_ENABLED,
      subject: DEFAULT_SUBJECT,
      count: recipients.length,
      recipients: recipients.map((r) => ({
        email: r.email,
        nom: r.nom,
        cognoms: r.cognoms,
        pagamentsIds: r.pagamentsIds,
      })),
      sampleHtml: recipients.length
        ? buildBulkEmailHtml(recipients[0])
        : buildBulkEmailHtml({ nom: 'Nom', cognoms: 'Cognom' }),
    };

    if (!wantSend) {
      return res.json({
        ...preview,
        message: 'Previsualitzacio: no s\'ha enviat res.',
      });
    }

    if (!SEND_ENABLED) {
      return res.status(403).json({
        ...preview,
        sent: 0,
        error: 'Enviament encara no habilitat (plantilla pendent).',
      });
    }

    // Real send path — inactive while SEND_ENABLED === false
    const nodemailer = require('nodemailer');
    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASSWORD;

    if (!gmailUser || !gmailPass) {
      return res.status(500).json({ error: 'Gmail env vars not configured' });
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: gmailUser, pass: gmailPass },
    });

    const results = { sent: 0, failed: [] };

    for (const r of recipients) {
      try {
        await transporter.sendMail({
          from: `Vitalqua Show <${gmailUser}>`,
          to: r.email,
          subject: DEFAULT_SUBJECT,
          html: buildBulkEmailHtml(r),
        });
        results.sent += 1;
      } catch (err) {
        results.failed.push({ email: r.email, error: err.message });
      }
    }

    return res.json({
      dryRun: false,
      sendEnabled: true,
      count: recipients.length,
      sent: results.sent,
      failed: results.failed,
      message: `Enviat a ${results.sent} de ${recipients.length} titulars.`,
    });
  } catch (err) {
    console.error('[send-bulk-show-email] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
