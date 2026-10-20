(() => {
  'use strict';
  const form = document.querySelector('#request-form');
  const button = document.querySelector('#request-submit');
  const status = document.querySelector('#request-status');
  let requestId = crypto.randomUUID();
  fetch('/api/diagnosis').then(r => r.ok ? r.json() : Promise.reject()).then(data => {
    button.disabled = !data.available;
    status.textContent = data.available ? '無料でお申し込みいただけます。' : '現在、受付準備中です。受付開始までお待ちください。';
  }).catch(() => { status.textContent = '現在、受付状況を確認できません。時間をおいてページを開き直してください。'; });
  form.addEventListener('input', () => { requestId = crypto.randomUUID(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity() || button.disabled) return;
    const fields = new FormData(form);
    const payload = { url: fields.get('listing'), email: fields.get('email'), note: fields.get('note'), website: fields.get('website'), consent: fields.get('consent') === 'on', requestId };
    button.disabled = true;
    button.textContent = '送信中…';
    status.textContent = '診断依頼を送信しています。';
    form.querySelectorAll('input, textarea').forEach(el => { el.disabled = true; });
    try {
      const response = await fetch('/api/diagnosis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '送信できませんでした。時間をおいて再送してください。');
      form.hidden = true;
      const done = document.querySelector('#request-done');
      done.hidden = false;
      document.querySelector('#receipt').textContent = data.requestId;
      done.focus();
    } catch (error) {
      status.textContent = error.message || '通信できませんでした。時間をおいて再送してください。';
      form.querySelectorAll('input, textarea').forEach(el => { el.disabled = false; });
      button.disabled = false;
    } finally { button.textContent = '無料診断を申し込む →'; }
  });
})();
