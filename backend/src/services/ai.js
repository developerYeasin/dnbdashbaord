// Multi-provider AI with several keys per provider. Keys are tried in priority order;
// a failing key (quota, invalid, timeout) falls through to the next one.
import { q } from '../db.js';
import { decrypt } from '../crypto.js';
import { httpJson, http } from './http.js';
import * as L from '../log.js';

export const PROVIDERS = {
  anthropic: { label: 'Claude (Anthropic)', model: 'claude-sonnet-5-5' },
  openai: { label: 'OpenAI', model: 'gpt-4.1-mini' },
  gemini: { label: 'Google Gemini', model: 'gemini-2.5-flash' },
  openrouter: { label: 'OpenRouter', model: 'openrouter/auto' },
  custom: { label: 'OpenAI-compatible (custom base URL)', model: '' },
  removebg: { label: 'remove.bg (ব্যাকগ্রাউন্ড রিমুভ)', model: '' },
  photoroom: { label: 'Photoroom (ব্যাকগ্রাউন্ড রিমুভ)', model: '' },
  clipdrop: { label: 'Clipdrop (ব্যাকগ্রাউন্ড রিমুভ)', model: '' },
};
const BG_PROVIDERS = ['removebg', 'photoroom', 'clipdrop'];

async function callOne(k, system, user, maxTokens) {
  const key = decrypt(k.key_enc);
  const model = k.model || PROVIDERS[k.provider]?.model;
  const timeout = 120000;
  if (k.provider === 'anthropic') {
    const { data } = await httpJson('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
    }, { timeout, retries: 1 });
    return { text: data.content.filter(c => c.type === 'text').map(c => c.text).join(''), tin: data.usage?.input_tokens, tout: data.usage?.output_tokens, model };
  }
  if (k.provider === 'gemini') {
    const { data } = await httpJson(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { maxOutputTokens: maxTokens, responseMimeType: 'application/json' } }),
    }, { timeout, retries: 1 });
    return { text: data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '', tin: data.usageMetadata?.promptTokenCount, tout: data.usageMetadata?.candidatesTokenCount, model };
  }
  // OpenAI, OpenRouter and any OpenAI-compatible endpoint
  const base = k.provider === 'openai' ? 'https://api.openai.com/v1' : k.provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : (k.base_url || '').replace(/\/+$/, '');
  if (!base) throw new Error('Custom provider-এর Base URL দেওয়া নেই');
  const { data } = await httpJson(`${base}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json', ...(k.provider === 'openrouter' ? { 'X-Title': 'DN Bangla Dashboard' } : {}) },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
  }, { timeout, retries: 1 });
  return { text: data.choices?.[0]?.message?.content || '', tin: data.usage?.prompt_tokens, tout: data.usage?.completion_tokens, model };
}

export async function generate(system, user, { maxTokens = 4096, keyId = null } = {}) {
  const keys = keyId
    ? await q('SELECT * FROM ai_keys WHERE id=?', [keyId])
    : await q(`SELECT * FROM ai_keys WHERE active=1 AND provider NOT IN (?) ORDER BY priority, id`, [BG_PROVIDERS]);
  if (!keys.length) throw new Error('কোনো সক্রিয় AI API Key নেই — সেটিংস → AI প্রোভাইডার থেকে যোগ করুন');
  const errors = [];
  for (const k of keys) {
    try {
      const r = await callOne(k, system, user, maxTokens);
      await q('UPDATE ai_keys SET calls=calls+1, tokens_in=tokens_in+?, tokens_out=tokens_out+?, last_used=NOW(), last_error=NULL WHERE id=?', [r.tin || 0, r.tout || 0, k.id]);
      return { ...r, provider: `${k.provider}:${r.model}`, keyId: k.id };
    } catch (e) {
      errors.push(`${k.label || k.provider}: ${e.message}`);
      await q('UPDATE ai_keys SET fails=fails+1, last_error=?, last_used=NOW() WHERE id=?', [e.message.slice(0, 500), k.id]);
      await L.warn('ai', `${k.label || k.provider} ব্যর্থ, পরের Key চেষ্টা করা হচ্ছে: ${e.message}`);
    }
  }
  throw new Error('সব AI Key ব্যর্থ: ' + errors.join(' | '));
}

// Extracts the first JSON object from a model reply (tolerates ```json fences)
export function parseJson(text) {
  const s = text.replace(/```(?:json)?/g, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('AI উত্তরে JSON পাওয়া যায়নি');
  return JSON.parse(s.slice(a, b + 1));
}

// ---------- background removal ----------
export async function removeBackground(buffer, mime = 'image/jpeg') {
  const keys = await q('SELECT * FROM ai_keys WHERE active=1 AND provider IN (?) ORDER BY priority, id', [BG_PROVIDERS]);
  if (!keys.length) throw new Error('ব্যাকগ্রাউন্ড রিমুভের API Key নেই — সেটিংস → AI প্রোভাইডার থেকে remove.bg / Photoroom / Clipdrop Key যোগ করুন, অথবা ম্যানুয়াল ব্রাশ ব্যবহার করুন');
  const errors = [];
  for (const k of keys) {
    const key = decrypt(k.key_enc);
    const fd = new FormData();
    const blob = new Blob([buffer], { type: mime });
    let url, headers;
    if (k.provider === 'removebg') { url = 'https://api.remove.bg/v1.0/removebg'; headers = { 'X-Api-Key': key }; fd.append('image_file', blob, 'image'); fd.append('size', 'auto'); fd.append('format', 'png'); }
    else if (k.provider === 'photoroom') { url = 'https://sdk.photoroom.com/v1/segment'; headers = { 'x-api-key': key }; fd.append('image_file', blob, 'image'); }
    else { url = 'https://clipdrop-api.co/remove-background/v1'; headers = { 'x-api-key': key }; fd.append('image_file', blob, 'image'); }
    try {
      const res = await http(url, { method: 'POST', headers, body: fd }, { timeout: 90000, retries: 1 });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const out = Buffer.from(await res.arrayBuffer());
      await q('UPDATE ai_keys SET calls=calls+1, last_used=NOW(), last_error=NULL WHERE id=?', [k.id]);
      return { buffer: out, provider: k.provider };
    } catch (e) {
      errors.push(`${k.provider}: ${e.message}`);
      await q('UPDATE ai_keys SET fails=fails+1, last_error=? WHERE id=?', [e.message.slice(0, 500), k.id]);
    }
  }
  throw new Error('ব্যাকগ্রাউন্ড রিমুভ ব্যর্থ: ' + errors.join(' | '));
}
