#!/usr/bin/env node
/* Limpeza de salas expiradas do Firebase RTDB (Sala de Agentes).
 * Roda via GitHub Action (cron diário). Precisa do secret FIREBASE_SERVICE_ACCOUNT.
 * Regra: apaga boxes/AGxxxxxx cuja última atividade (`criado`, renovada a cada
 * mensagem) seja mais antiga que o prazo da sala (`ttlHoras`, 72–168h).
 * Só mexe em salas (chave começa com "AG") — caixas do caixa-agente ficam intactas.
 */
import { readFileSync } from 'node:fs';

let raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
if (!raw) {
  console.log('⚠️  Secret FIREBASE_SERVICE_ACCOUNT ausente — limpeza pulada.');
  console.log('   Configure em: repo → Settings → Secrets and variables → Actions.');
  process.exit(0);
}
if (!raw.startsWith('{')) {
  try { raw = Buffer.from(raw, 'base64').toString('utf8'); } catch {}
}
let sa;
try { sa = JSON.parse(raw); }
catch (e) { console.error('❌ Secret não é um JSON válido de service account:', e.message); process.exit(1); }

const { initializeApp, cert } = await import('firebase-admin/app');
const { getDatabase } = await import('firebase-admin/database');

const DB_URL = sa.databaseURL || 'https://caixa-agente-default-rtdb.firebaseio.com';
initializeApp({ credential: cert(sa), databaseURL: DB_URL });

const snap = await getDatabase().ref('boxes').once('value');
const total = snap.numChildren();
const vencidas = [];
snap.forEach(ch => {
  const code = ch.key;
  if (!code || !code.startsWith('AG')) return;   /* só salas; caixas não */
  const v = ch.val() || {};
  const t = typeof v.criado === 'number' ? v.criado : 0;
  const ttlH = (typeof v.ttlHoras === 'number' && v.ttlHoras >= 72 && v.ttlHoras <= 168)
    ? Math.round(v.ttlHoras) : 168;
  if (t && t < Date.now() - ttlH * 3600000) vencidas.push(code);
});

console.log(`Varredura: ${total} nó(s) em boxes · ${vencidas.length} sala(s) AG vencida(s)`);
let removidas = 0;
for (const code of vencidas) {
  try {
    await getDatabase().ref('boxes/' + code).remove();
    removidas++;
    console.log('  🗑 removida:', code);
  } catch (e) {
    console.error('  ❌ falha ao remover', code, e.message);
  }
}
console.log(`✅ Fim: ${removidas} sala(s) removida(s).`);
process.exit(0);  /* o client do RTDB segura sockets abertos - sem isso o runner fica pendurado */
