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
      const listing = new URL(payload.url.trim());
      const listingLink = document.querySelector('#submitted-listing');
      listingLink.href = listing.origin + listing.pathname;
      listingLink.textContent = listing.origin + listing.pathname;
      document.querySelector('#submitted-email').textContent = payload.email.trim();
      document.querySelector('#confirmation-status').textContent = data.confirmationEmailAccepted
        ? '受付確認メールを送信しました。返信の目安と受付番号をメールでもご確認いただけます。'
        : '依頼は受け付けましたが、受付確認メールを送信できませんでした。再申し込みは不要です。受付番号と返信の目安をこの画面でお控えください。';
      const toolUrl = document.querySelector('#url');
      toolUrl.value = listing.origin + listing.pathname;
      const title = document.querySelector('#done-title');
      title.setAttribute('tabindex', '-1');
      title.focus({ preventScroll: true });
      done.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    } catch (error) {
      status.textContent = error.message || '通信できませんでした。時間をおいて再送してください。';
      form.querySelectorAll('input, textarea').forEach(el => { el.disabled = false; });
      button.disabled = false;
    } finally { button.textContent = '無料で写真診断を申し込む'; }
  });
})();
