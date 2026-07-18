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
const ICON_CAMERA_URL = SITE_BASE.replace(/\/$/, '') + '/img/icon-camera.png';
const ICON_DONACIO_URL = SITE_BASE.replace(/\/$/, '') + '/img/icon-migranodearena.png';
const DONACIO_URL =
  'https://www.migranodearena.org/reto/agua-y-educacion-para-kenia-construyendo-el-futuro-de-emorogi';

const DEFAULT_SUBJECT = 'Gràcies per venir 💙 · Vitalqua Show';

// ---------------------------------------------------------------------------
// Bulk thank-you email (titulars)
// ---------------------------------------------------------------------------
function buildBulkEmailHtml({ nom, cognoms }) {
  const name = [nom, cognoms].filter(Boolean).join(' ').trim() || 'hola';
  const sans = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";

  const button = (href, label, icon, opts) => {
    const solid = opts && opts.solid;
    const gradient = solid
      ? 'background:linear-gradient(120deg,#1B5F85 0%,#2FA0D6 100%);box-shadow:0 10px 22px -6px rgba(27,95,133,.55);'
      : 'background:linear-gradient(120deg,#E8724A 0%,#F0A15C 100%);box-shadow:0 10px 22px -6px rgba(216,98,58,.5);';
    return (
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 ' + (opts && opts.marginBottom || 26) + 'px;border-collapse:separate"><tr>' +
        '<td style="' + gradient + 'border-radius:14px">' +
          '<a href="' + href + '" style="display:block;text-decoration:none;padding:15px 18px">' +
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
              '<td style="width:38px">' +
                '<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="width:34px;height:34px;background:#ffffff;border-radius:10px;text-align:center;vertical-align:middle">' + icon + '</td></tr></table>' +
              '</td>' +
              '<td style="font-size:15px;font-weight:700;color:#ffffff;' + sans + 'padding-left:6px">' + label + '</td>' +
              '<td style="width:30px;text-align:right">' +
                '<table role="presentation" cellpadding="0" cellspacing="0" style="margin-left:auto"><tr><td style="width:26px;height:26px;background:rgba(255,255,255,.25);border-radius:8px;text-align:center;font-size:14px;font-weight:700;color:#ffffff;line-height:26px">&#8594;</td></tr></table>' +
              '</td>' +
            '</tr></table>' +
          '</a>' +
        '</td>' +
      '</tr></table>'
    );
  };

  return (
    '<div style="' + sans + 'max-width:580px;margin:0 auto;background:#EAF2F8;padding:32px 16px">' +
    '<div style="background:#ffffff;border:1px solid #D6EEF6;border-radius:18px;overflow:hidden">' +
    '<div style="height:5px;background:#1B5F85"></div>' +
    '<div style="padding:36px 34px 32px">' +

      '<h1 style="margin:0 0 20px;font-size:23px;font-weight:700;color:#0F1A2E;letter-spacing:-.01em;line-height:1.35">Gr&agrave;cies per fer-ho possible!</h1>' +

      '<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#3F4F6B">' +
        'Hola <strong style="color:#0F1A2E;font-weight:600">' + escapeHtml(name) + '</strong>,' +
      '</p>' +
      '<p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:#3F4F6B">' +
        'Encara no ens creiem tot el que vam viure dijous al Vitalqua Show. ' +
        'Va ser una nit m&agrave;gica per a nosaltres, i vol&iacute;em donar-te les gr&agrave;cies ' +
        'per acompanyar-nos. Sentir el vostre suport ens anima a seguir endavant!' +
      '</p>' +

      '<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#3F4F6B">' +
        'Perqu&egrave; puguis recordar la nit, aqu&iacute; tens el recull de fotos:' +
      '</p>' +
      button(
        FOTOS_URL,
        'Reviure els moments en fotos',
        '<img src="' + ICON_CAMERA_URL + '" width="19" height="19" alt="" style="display:block;margin:7px auto;border:0" />',
        { solid: true, marginBottom: 26 }
      ) +

      '<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#3F4F6B">' +
        'Volem aprofitar per agrair-te tot el que has aportat al projecte. ' +
        'Com saps, el motiu que ens mou &eacute;s portar aigua i vida a Kenya. ' +
        'Aqu&iacute; et deixem l\'enlla&ccedil; per si vols fer una aportaci&oacute; extra!' +
      '</p>' +
      button(
        DONACIO_URL,
        'Continuar ajudant amb migranodearena',
        '<img src="' + ICON_DONACIO_URL + '" width="26" alt="" style="display:block;margin:0 auto;border:0" />',
        { solid: false, marginBottom: 28 }
      ) +

      '<div style="height:1px;background:#EBF4FA;margin:0 0 24px"></div>' +

      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
        '<td style="font-size:14px;line-height:1.6;color:#6B7890;vertical-align:middle">' +
          'Una abra&ccedil;ada gran,<br><strong style="color:#0F1A2E;font-weight:600">L\'equip Vitalqua</strong> &#128153;' +
        '</td>' +
        '<td style="text-align:right;vertical-align:middle;white-space:nowrap">' +
          '<img src="' + LOGO_URL + '" alt="Vitalqua Project" width="180" height="39" style="display:inline-block;vertical-align:middle;border:0" />' +
        '</td>' +
      '</tr></table>' +
    '</div>' +
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
