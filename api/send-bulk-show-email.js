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
const LOGO_URL = SITE_BASE.replace(/\/$/, '') + '/img/logo-full.svg';
const DONACIO_URL =
  'https://www.migranodearena.org/reto/agua-y-educacion-para-kenia-construyendo-el-futuro-de-emorogi';

const DEFAULT_SUBJECT = 'Gràcies per venir 💙 · Vitalqua Show';

// ---------------------------------------------------------------------------
// Bulk thank-you email (titulars)
// ---------------------------------------------------------------------------
function buildBulkEmailHtml({ nom, cognoms }) {
  const name = [nom, cognoms].filter(Boolean).join(' ').trim() || 'hola';
  const sans = 'font-family:Arial,Helvetica,sans-serif;';

  const button = (href, label, opts) => {
    const solid = opts && opts.solid;
    const cellStyle = solid
      ? 'background:#1E3A5C;border-radius:12px;box-shadow:0 6px 14px rgba(30,58,92,.28);'
      : 'background:#ffffff;border:2px solid #1E3A5C;border-radius:12px;box-shadow:0 6px 14px rgba(30,58,92,.14);';
    const textColor = solid ? '#ffffff' : '#1E3A5C';
    const linkPad = solid ? '15px 22px' : '14px 22px';
    return (
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 ' + (opts && opts.marginBottom || 28) + 'px;border-collapse:separate"><tr>' +
        '<td style="' + cellStyle + '">' +
          '<a href="' + href + '" style="display:block;text-decoration:none;padding:' + linkPad + '">' +
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
              '<td style="font-size:15px;font-weight:700;color:' + textColor + ';' + sans + '">' + label + '</td>' +
              '<td style="width:20px;text-align:right;font-size:16px;font-weight:700;color:' + textColor + '">&#8594;</td>' +
            '</tr></table>' +
          '</a>' +
        '</td>' +
      '</tr></table>'
    );
  };

  return (
    '<div style="' + sans + 'max-width:600px;margin:0 auto;background:#F1EFE7;padding:34px 16px">' +
    '<div style="background:#E7E2D2;border-radius:20px;overflow:hidden">' +
    '<div style="padding:36px 36px 30px">' +

      '<h1 style="margin:0 0 22px;font-size:24px;font-weight:800;color:#1E3A5C;letter-spacing:-.01em;line-height:1.3">Gr&agrave;cies per fer-ho possible! &#128149;</h1>' +

      '<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#3F4A5C">' +
        'Hola <strong style="color:#1E3A5C">' + escapeHtml(name) + '</strong>,' +
      '</p>' +
      '<p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#3F4A5C">' +
        'Encara no ens creiem tot el que vam viure dijous al Vitalqua Show. ' +
        'Va ser una nit m&agrave;gica per a nosaltres, i vol&iacute;em donar-te les gr&agrave;cies ' +
        'per acompanyar-nos. Sentir el vostre suport ens anima a seguir endavant!' +
      '</p>' +

      '<p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#3F4A5C">' +
        'Perqu&egrave; puguis recordar la nit, aqu&iacute; tens el recull de fotos:' +
      '</p>' +
      button(FOTOS_URL, '&#128247;&nbsp; Reviure els moments en fotos', { solid: true, marginBottom: 28 }) +

      '<p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#3F4A5C">' +
        'Volem aprofitar per agrair-te tot el que has aportat al projecte. ' +
        'Com saps, el motiu que ens mou &eacute;s portar aigua i vida a Kenya. ' +
        'Aqu&iacute; et deixem l\'enlla&ccedil; per si vols fer una aportaci&oacute; extra!' +
      '</p>' +
      button(DONACIO_URL, '&#10084;&#65039;&nbsp; Continuar ajudant amb migranodearena', { solid: false, marginBottom: 30 }) +

      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
        '<td style="font-size:14px;line-height:1.7;color:#5B6472;vertical-align:middle">' +
          'Una abra&ccedil;ada gran,<br><strong style="color:#1E3A5C">L\'equip Vitalqua</strong> &#128153;' +
        '</td>' +
        '<td style="text-align:right;vertical-align:middle;white-space:nowrap">' +
          '<img src="' + LOGO_URL + '" alt="Vitalqua Project" width="120" height="26" style="display:inline-block;vertical-align:middle;border:0" />' +
        '</td>' +
      '</tr></table>' +
    '</div>' +
    '<div style="height:24px;background:#93917F"></div>' +
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
