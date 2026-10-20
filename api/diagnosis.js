const { createHash } = require('node:crypto');

const emailPattern = /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/;
function configured() {
  return Boolean(process.env.RESEND_API_KEY && emailPattern.test(process.env.DIAGNOSIS_TO_EMAIL || '') && process.env.DIAGNOSIS_FROM_EMAIL);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'GET') return res.status(200).json({ available: configured() });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ message: 'この操作には対応していません。' });
  }
  const origin = req.headers.origin;
  const expected = process.env.APP_ORIGIN || 'https://hostboost-alpha.vercel.app';
  if (!origin || origin !== expected) return res.status(403).json({ message: 'サイトの申込フォームから送信してください。' });
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) return res.status(415).json({ message: '送信形式が正しくありません。' });
  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { return res.status(400).json({ message: '入力内容を確認してください。' }); }
  if (!body || JSON.stringify(body).length > 6000) return res.status(400).json({ message: '入力内容を確認してください。' });
  if (body.website) return res.status(400).json({ message: '送信できませんでした。' });
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const urlText = typeof body.url === 'string' ? body.url.trim() : '';
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (!emailPattern.test(email) || email.length > 254 || note.length > 1000 || body.consent !== true || !/^[a-f0-9-]{36}$/i.test(body.requestId || '')) return res.status(400).json({ message: 'メールアドレスと同意のチェックを確認してください。' });
  let url;
  try { url = new URL(urlText); } catch { return res.status(400).json({ message: 'Airbnbの掲載URLを確認してください。' }); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !/^(www\.)?airbnb\.(jp|com|co\.uk|com\.au|ca|fr|de|it|es)$/.test(url.hostname) || !/^\/rooms\/\d+\/?$/.test(url.pathname)) return res.status(400).json({ message: 'https://www.airbnb.jp/rooms/… のような掲載ページURLを入力してください。' });
  if (!configured()) return res.status(503).json({ message: '現在、受付準備中です。しばらくしてからお申し込みください。' });
  const canonical = url.origin + url.pathname;
  const payload = {
    from: process.env.DIAGNOSIS_FROM_EMAIL,
    to: [process.env.DIAGNOSIS_TO_EMAIL],
    reply_to: email,
    subject: '【ホストブースト】無料写真診断の依頼',
    text: `無料診断の依頼が届きました。\n\n掲載URL: ${canonical}\n返信先: ${email}\n相談内容:\n${note || '指定なし'}\n\n受付番号: ${body.requestId}\n個人情報の利用への同意: あり（診断対応・結果送付・必要な連絡）\n\n掲載ページを手動で確認し、改善ポイントを3つまとめて上記の返信先へ送ってください。\nこのメールに返信すると申込者宛てになります。\n目安: 3営業日以内（土日祝を除く）\n\n【レポートの項目】\n1. カバー写真の改善\n2. 最初の数枚の掲載順\n3. 補正・撮り直しのポイント\n\n申込内容は利用者が入力した情報です。URLと相談内容は確認のうえ扱ってください。`
  };
  const key = createHash('sha256').update(JSON.stringify({ id: body.requestId, email, canonical, note })).digest('hex');
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `diagnosis-${key}` },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(10000)
      });
      if (response.ok) {
        const result = await response.json();
        if (result.id) return res.status(200).json({ requestId: body.requestId });
      }
      if (response.status < 500 && response.status !== 429) break;
    } catch { /* Retry with the same idempotency key; never log personal information. */ }
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
  }
  return res.status(502).json({ message: '依頼メールを送信できませんでした。入力内容は残っています。時間をおいて再送してください。' });
};
