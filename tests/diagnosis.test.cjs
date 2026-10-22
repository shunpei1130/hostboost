const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

const source = fs.readFileSync(path.join(__dirname, '../api/diagnosis.js'), 'utf8');
const requestId = 'c29af0ea-8609-4400-baf9-45f062f4b400';
const origin = 'https://hostboost-alpha.vercel.app';
const body = {
  url: 'https://www.airbnb.jp/rooms/123456?source=test',
  email: 'guest@example.com',
  note: '一枚目を見直したい',
  consent: true,
  requestId
};

function setup(outcomes = []) {
  const calls = [];
  const delays = [];
  const timeouts = [];
  const context = {
    module: { exports: {} },
    require,
    URL,
    process: { env: {
      RESEND_API_KEY: 'test-only-no-network',
      DIAGNOSIS_TO_EMAIL: 'operator@example.com',
      DIAGNOSIS_FROM_EMAIL: 'ホストブースト <sender@example.com>',
      APP_ORIGIN: origin
    } },
    AbortSignal: { timeout(ms) { timeouts.push(ms); return { testTimeout: ms }; } },
    setTimeout(callback, delay) { delays.push(delay); callback(); },
    fetch: async (url, options) => {
      calls.push({ url, options, payload: JSON.parse(options.body) });
      const outcome = outcomes.shift();
      assert.notEqual(outcome, undefined, 'Every network attempt must have an explicit mock response');
      if (outcome instanceof Error) throw outcome;
      return {
        ok: outcome.status >= 200 && outcome.status < 300,
        status: outcome.status,
        json: async () => outcome.body ?? {}
      };
    }
  };
  vm.runInNewContext(source, context, { filename: 'diagnosis.js' });
  async function invoke(overrides = {}) {
    const response = { statusCode: null, headers: {}, body: null };
    const res = {
      setHeader(name, value) { response.headers[name] = value; },
      status(code) { response.statusCode = code; return this; },
      json(value) { response.body = JSON.parse(JSON.stringify(value)); return this; }
    };
    await context.module.exports({
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: { ...body },
      ...overrides
    }, res);
    return response;
  }
  return { invoke, calls, delays, timeouts };
}

const accepted = id => ({ status: 200, body: { id } });

test('accepts the operator notification before sending a separate applicant confirmation', async () => {
  const fixture = setup([accepted('operator-id'), accepted('confirmation-id')]);
  const response = await fixture.invoke();
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { requestId, confirmationEmailAccepted: true });
  assert.equal(fixture.calls.length, 2);
  const [operator, confirmation] = fixture.calls;
  assert.deepEqual(operator.payload.to, ['operator@example.com']);
  assert.equal(operator.payload.reply_to, body.email);
  assert.deepEqual(confirmation.payload.to, [body.email]);
  assert.equal(confirmation.payload.reply_to, 'operator@example.com');
  assert.equal(confirmation.payload.subject, '【ホストブースト】無料写真診断を受け付けました');
  assert.equal(confirmation.payload.from, operator.payload.from);
  assert.match(confirmation.payload.text, /https:\/\/www\.airbnb\.jp\/rooms\/123456/);
  assert.doesNotMatch(confirmation.payload.text, /source=test/);
  assert.doesNotMatch(confirmation.payload.text, /一枚目を見直したい/);
  for (const phrase of ['改善ポイント3つ', '最初の3枚', 'Before／After 1組', requestId, '通常3営業日以内', '土日祝を除く', '元写真を受領してから', 'そのままお使いいただけます']) {
    assert.ok(confirmation.payload.text.includes(phrase), phrase);
  }
  for (const phrase of ['構図の調整や小物の整理', '家具・設備・間取り・眺望', '追加で送付']) {
    assert.ok(operator.payload.text.includes(phrase), phrase);
  }
  assert.deepEqual(fixture.timeouts, [10000, 10000]);
  assert.equal(response.headers['Cache-Control'], 'no-store');
});

test('preserves the original operator key and uses a distinct deterministic confirmation key', async () => {
  const fixture = setup([accepted('o1'), accepted('c1'), accepted('o1'), accepted('c1')]);
  await fixture.invoke();
  await fixture.invoke();
  const hash = createHash('sha256').update(JSON.stringify({
    id: requestId, email: body.email, canonical: 'https://www.airbnb.jp/rooms/123456', note: body.note
  })).digest('hex');
  const keys = fixture.calls.map(call => call.options.headers['Idempotency-Key']);
  assert.deepEqual(keys, [`diagnosis-${hash}`, `diagnosis-confirmation-${hash}`, `diagnosis-${hash}`, `diagnosis-confirmation-${hash}`]);
});

test('operator transient failures stop after three attempts and never send confirmation', async () => {
  const fixture = setup([{ status: 500 }, { status: 429 }, new Error('mock timeout')]);
  const response = await fixture.invoke();
  assert.equal(response.statusCode, 502);
  assert.equal(fixture.calls.length, 3);
  assert.deepEqual(fixture.delays, [500, 1000]);
  assert.equal(new Set(fixture.calls.map(call => call.options.headers['Idempotency-Key'])).size, 1);
  assert.ok(fixture.calls.every(call => call.payload.to[0] === 'operator@example.com'));
});

test('a permanent operator rejection is not retried and does not send confirmation', async () => {
  const fixture = setup([{ status: 422 }]);
  const response = await fixture.invoke();
  assert.equal(response.statusCode, 502);
  assert.equal(fixture.calls.length, 1);
  assert.deepEqual(fixture.delays, []);
});

test('confirmation failure keeps the request accepted and stops after two attempts', async () => {
  const fixture = setup([accepted('operator-id'), { status: 503 }, new Error('mock timeout')]);
  const response = await fixture.invoke();
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { requestId, confirmationEmailAccepted: false });
  assert.equal(fixture.calls.length, 3);
  assert.deepEqual(fixture.delays, [500]);
  assert.equal(fixture.calls[1].options.headers['Idempotency-Key'], fixture.calls[2].options.headers['Idempotency-Key']);
});

test('confirmation retries can recover without repeating the operator send', async () => {
  const fixture = setup([accepted('operator-id'), { status: 429 }, accepted('confirmation-id')]);
  const response = await fixture.invoke();
  assert.equal(response.body.confirmationEmailAccepted, true);
  assert.deepEqual(fixture.calls.map(call => call.payload.to[0]), ['operator@example.com', body.email, body.email]);
});

test('a permanent confirmation rejection preserves acceptance without retrying', async () => {
  const fixture = setup([accepted('operator-id'), { status: 422 }]);
  const response = await fixture.invoke();
  assert.deepEqual(response.body, { requestId, confirmationEmailAccepted: false });
  assert.equal(fixture.calls.length, 2);
});

test('missing provider acceptance IDs are not treated as successful sends', async () => {
  const fixture = setup([{ status: 200 }, { status: 200 }, { status: 200 }]);
  const response = await fixture.invoke();
  assert.equal(response.statusCode, 502);
  assert.equal(fixture.calls.length, 3);
});

test('GET readiness performs no email sends', async () => {
  const fixture = setup();
  const response = await fixture.invoke({ method: 'GET' });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { available: true });
  assert.equal(fixture.calls.length, 0);
});

test('invalid requests retain existing validation and perform no email sends', async () => {
  const invalid = [
    { headers: { origin: 'https://untrusted.example', 'content-type': 'application/json' } },
    { body: { ...body, url: 'https://example.com/rooms/123456' } },
    { body: { ...body, url: 'https://www.airbnb.jp/rooms/123456/extra' } },
    { body: { ...body, email: 'invalid' } },
    { body: { ...body, consent: false } },
    { body: { ...body, website: 'honeypot-filled' } },
    { body: { ...body, requestId: 'invalid' } }
  ];
  for (const overrides of invalid) {
    const fixture = setup();
    const response = await fixture.invoke(overrides);
    assert.ok(response.statusCode >= 400 && response.statusCode < 500);
    assert.equal(fixture.calls.length, 0);
  }
});
