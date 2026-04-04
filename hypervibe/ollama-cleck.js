/**

- ollama-check.js — Verifica che Ollama sia attivo e il modello disponibile
- 
- Uso: node ollama-check.js
  */

import fetch from ‘node-fetch’;
import { execSync } from ‘child_process’;

const BASE  = process.env.OLLAMA_BASE_URL || ‘http://localhost:11434’;
const MODEL = process.env.OLLAMA_MODEL    || ‘qwen2.5:14b’;

console.log(’\n🔍 HyperVibe — Ollama Check\n’);

// 1. Ping Ollama
let running = false;
try {
const r = await fetch(`${BASE}/api/tags`, { signal: AbortSignal.timeout(3000) });
if (r.ok) {
running = true;
console.log(`✅ Ollama raggiungibile su ${BASE}`);
}
} catch {
console.error(`❌ Ollama NON raggiungibile su ${BASE}`);
console.error(’   Avvia Ollama con:  ollama serve’);
process.exit(1);
}

// 2. Controlla modelli disponibili
const tagsResp = await fetch(`${BASE}/api/tags`);
const tags = await tagsResp.json();
const models = (tags.models || []).map(m => m.name);

console.log(`\n📦 Modelli installati: ${models.length ? models.join(', ') : '(nessuno)'}`);

const modelAvailable = models.some(m => m.startsWith(MODEL.split(’:’)[0]));

if (modelAvailable) {
console.log(`✅ Modello "${MODEL}" disponibile`);
} else {
console.warn(`⚠️  Modello "${MODEL}" NON trovato`);
console.log(`\n   Scaricalo con:\n   ollama pull ${MODEL}\n`);
console.log(’   Modelli alternativi con tool calling:’);
console.log(’   - ollama pull qwen2.5:7b      (leggero, 5GB)’);
console.log(’   - ollama pull llama3.1:8b     (Meta, 5GB)’);
console.log(’   - ollama pull mistral-nemo:12b (Mistral, 8GB)’);
}

// 3. Test tool calling
console.log(’\n🧪 Test tool calling…’);
try {
const resp = await fetch(`${BASE}/v1/chat/completions`, {
method: ‘POST’,
headers: { ‘Content-Type’: ‘application/json’ },
body: JSON.stringify({
model: MODEL,
messages: [{ role: ‘user’, content: ‘Call the test tool with value 42’ }],
tools: [{
type: ‘function’,
function: {
name: ‘test_tool’,
description: ‘A test tool’,
parameters: {
type: ‘object’,
properties: { value: { type: ‘number’ } },
required: [‘value’]
}
}
}],
stream: false
})
});

if (resp.ok) {
const json = await resp.json();
const tc = json.choices?.[0]?.message?.tool_calls;
if (tc && tc.length > 0) {
console.log(`✅ Tool calling funzionante! (${MODEL} ha chiamato: ${tc[0].function.name})`);
} else {
console.warn(`⚠️  Il modello non ha usato il tool. Prova qwen2.5:14b per tool calling migliore.`);
}
}
} catch (err) {
console.error(‘❌ Errore nel test tool calling:’, err.message);
}

console.log(’\n✨ Check completato. Se tutto è ✅, avvia HyperVibe normalmente.\n’);