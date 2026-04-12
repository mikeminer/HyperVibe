/**
 * llm-provider.js — Unified LLM adapter per HyperVibe
 *
 * PROVIDER=ollama      → Ollama locale, modello da OLLAMA_MODEL (gratis)
 * PROVIDER=anthropic   → Anthropic API, richiede ANTHROPIC_API_KEY (a pagamento)
 * PROVIDER=trihybrid   → Tri-Hybrid Engine bridge su :3002
 * PROVIDER=smart       → 🧠 Smart routing: Ollama first → Anthropic fallback
 *                        Usa Anthropic SOLO se Ollama fallisce o produce
 *                        una risposta senza tool_use quando i tool erano attesi.
 *
 * Output sempre in formato Anthropic:
 *   { content: [ {type:'text'|'tool_use', ...} ], stop_reason: '...' }
 *
 * Node 18+ ha fetch globale — non serve node-fetch.
 */

const PROVIDER        = (process.env.PROVIDER || 'ollama').toLowerCase();
const OLLAMA_BASE     = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL    = process.env.OLLAMA_MODEL    || 'qwen2.5:7b';
const ANTHROPIC_MODEL = process.env.CLAUDE_MODEL    || 'claude-sonnet-4-20250514';
const THY_BRIDGE_URL  = process.env.THY_BRIDGE_URL  || 'http://127.0.0.1:3002';

// ─── Cost tracker ─────────────────────────────────────────────────────────────
// Prezzi approssimativi per token (input+output medi)
const COST_PER_TOKEN = {
  'claude-sonnet-4-20250514': 0.000003,
  'claude-opus-4-20250514':   0.000015,
  'claude-haiku-4-5-20251001':0.0000008,
  ollama:                     0,
  trihybrid:                  0,
};

const sessionStats = {
  calls:   { ollama: 0, anthropic: 0, trihybrid: 0, smart_local: 0, smart_escalated: 0 },
  tokens:  { ollama: 0, anthropic: 0 },
  costUSD: 0,
};

function trackCall(provider, tokensEstimate = 1000) {
  if (provider === 'ollama' || provider === 'smart_local') {
    sessionStats.calls.ollama++;
    sessionStats.tokens.ollama += tokensEstimate;
    if (provider === 'smart_local') sessionStats.calls.smart_local++;
  } else if (provider === 'anthropic' || provider === 'smart_escalated') {
    sessionStats.calls.anthropic++;
    sessionStats.tokens.anthropic += tokensEstimate;
    const cost = tokensEstimate * (COST_PER_TOKEN[ANTHROPIC_MODEL] || 0.000003);
    sessionStats.costUSD += cost;
    if (provider === 'smart_escalated') sessionStats.calls.smart_escalated++;
    console.warn(`[💸 API] Anthropic call — ~${tokensEstimate} tokens | costo stimato: $${cost.toFixed(5)} | totale sessione: $${sessionStats.costUSD.toFixed(4)}`);
  } else if (provider === 'trihybrid') {
    sessionStats.calls.trihybrid++;
  }
}

export function getSessionStats() {
  return {
    ...sessionStats,
    summary: `Ollama: ${sessionStats.calls.ollama} calls (free) | Anthropic: ${sessionStats.calls.anthropic} calls ($${sessionStats.costUSD.toFixed(4)}) | Smart escalations: ${sessionStats.calls.smart_escalated}`,
  };
}

// ─── Anthropic ────────────────────────────────────────────────────────────────

async function anthropicCreate({ max_tokens, system, messages, tools }) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: max_tokens || 4096,
    system,
    messages,
    tools
  });
}

// ─── Tri-Hybrid Bridge ────────────────────────────────────────────────────────

async function trihybridCreate({ max_tokens, system, messages, tools }) {
  const body = {
    model:      'tri-hybrid',
    max_tokens: max_tokens || 4096,
    system:     system || '',
    messages,
  };
  if (tools?.length > 0) body.tools = tools;

  let resp;
  try {
    resp = await fetch(`${THY_BRIDGE_URL}/v1/messages`, {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY || 'tri-hybrid',
        'anthropic-version': '2023-06-01',
      },
      body:   JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    throw new Error(
      `[Tri-Hybrid] Impossibile connettersi al bridge su ${THY_BRIDGE_URL}.\n` +
      `Avvia il bridge con: python bridge.py\n${err.message}`
    );
  }

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`[Tri-Hybrid] HTTP ${resp.status}: ${text}`);
  }

  return await resp.json();
}

// ─── Ollama — converters ──────────────────────────────────────────────────────

function toOllamaTool(tool) {
  return {
    type: 'function',
    function: {
      name:        tool.name,
      description: tool.description || '',
      parameters:  tool.input_schema || { type: 'object', properties: {} }
    }
  };
}

function toOllamaMessages(system, messages) {
  const out = [];
  if (system) out.push({ role: 'system', content: system });

  for (const msg of messages) {
    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        out.push({ role: 'user', content: msg.content });
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'tool_result') {
            out.push({
              role:         'tool',
              tool_call_id: block.tool_use_id,
              content:      typeof block.content === 'string'
                              ? block.content
                              : JSON.stringify(block.content)
            });
          } else if (block.type === 'text') {
            out.push({ role: 'user', content: block.text });
          }
        }
      }

    } else if (msg.role === 'assistant') {
      if (typeof msg.content === 'string') {
        out.push({ role: 'assistant', content: msg.content });
      } else if (Array.isArray(msg.content)) {
        const textBlocks = msg.content.filter(b => b.type === 'text');
        const toolBlocks = msg.content.filter(b => b.type === 'tool_use');

        const assistantMsg = {
          role:    'assistant',
          content: textBlocks.map(b => b.text).join('\n') || null
        };

        if (toolBlocks.length > 0) {
          assistantMsg.tool_calls = toolBlocks.map(b => ({
            id:       b.id || `call_${b.name}_${Date.now()}`,
            type:     'function',
            function: {
              name:      b.name,
              arguments: JSON.stringify(b.input || {})
            }
          }));
        }

        out.push(assistantMsg);
      }
    }
  }

  return out;
}

// ─── Ollama — response converter ──────────────────────────────────────────────

function fromOllamaResponse(ollamaResp) {
  const choice  = ollamaResp.choices?.[0];
  const message = choice?.message || {};

  const content = [];
  let stop_reason = 'end_turn';

  if (message.content) {
    content.push({ type: 'text', text: message.content });
  }

  if (message.tool_calls && message.tool_calls.length > 0) {
    stop_reason = 'tool_use';
    for (const tc of message.tool_calls) {
      let input = {};
      try {
        input = JSON.parse(tc.function.arguments || '{}');
      } catch {
        input = { raw: tc.function.arguments };
      }
      content.push({
        type:  'tool_use',
        id:    tc.id || `call_${tc.function.name}_${Date.now()}`,
        name:  tc.function.name,
        input
      });
    }
  }

  const fr = choice?.finish_reason;
  if (fr === 'tool_calls' || fr === 'function_call') stop_reason = 'tool_use';
  if (fr === 'stop')                                  stop_reason = 'end_turn';
  if (fr === 'length')                                stop_reason = 'max_tokens';

  return { content, stop_reason };
}

// ─── Ollama backend ───────────────────────────────────────────────────────────

async function ollamaCreate({ max_tokens, system, messages, tools }) {
  const body = {
    model:    OLLAMA_MODEL,
    messages: toOllamaMessages(system, messages),
    stream:   false,
    options:  { num_predict: max_tokens || 4096 }
  };

  if (tools?.length > 0) body.tools = tools.map(toOllamaTool);

  let resp;
  try {
    resp = await fetch(`${OLLAMA_BASE}/v1/chat/completions`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(120_000)
    });
  } catch (err) {
    throw new Error(
      `[Ollama] Impossibile connettersi a ${OLLAMA_BASE}.\n` +
      `Avvia Ollama con: ollama serve\n${err.message}`
    );
  }

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`[Ollama] HTTP ${resp.status}: ${text}`);
  }

  return fromOllamaResponse(await resp.json());
}

// ─── Ollama health check ──────────────────────────────────────────────────────

async function isOllamaAvailable() {
  try {
    const resp = await fetch(`${OLLAMA_BASE}/api/tags`, {
      signal: AbortSignal.timeout(3000)
    });
    return resp.ok;
  } catch {
    return false;
  }
}

// ─── Smart routing ────────────────────────────────────────────────────────────
//
// Logica:
//   1. Prova sempre Ollama prima (gratis)
//   2. Se Ollama non è disponibile → Anthropic direttamente
//   3. Se Ollama risponde ma i tools erano attesi e non ne ha chiamato nessuno
//      (stop_reason non è tool_use e ci sono tools definiti con >2 loop già fatti)
//      → escalation ad Anthropic
//   4. Se Ollama lancia errore HTTP → escalation ad Anthropic
//
// Il flag SMART_ESCALATE_ON_EMPTY_TOOLS=false disabilita l'escalation automatica
// e lascia che Ollama risponda senza tool (a volte è corretto).

const SMART_ESCALATE_ON_TOOL_FAILURE = process.env.SMART_ESCALATE_ON_TOOL_FAILURE !== 'false';

async function smartCreate(params) {
  const { tools } = params;
  const hasTools  = tools && tools.length > 0;

  // Controlla disponibilità Ollama
  const ollamaUp = await isOllamaAvailable();

  if (!ollamaUp) {
    console.warn('[🧠 Smart] Ollama non disponibile → escalation Anthropic');
    trackCall('smart_escalated', params.max_tokens || 1000);
    return anthropicCreate(params);
  }

  // Prova Ollama
  let ollamaResult;
  try {
    ollamaResult = await ollamaCreate(params);
    const hasToolCalls = ollamaResult.content.some(b => b.type === 'tool_use');

    // Se i tool erano attesi ma Ollama non ne ha chiamato nessuno E
    // la risposta è molto corta (probabile fallimento silenzioso)
    if (hasTools && !hasToolCalls && SMART_ESCALATE_ON_TOOL_FAILURE) {
      const textContent = ollamaResult.content.find(b => b.type === 'text')?.text || '';
      const isShort     = textContent.length < 100;
      const looksLost   = /non so|cannot|unable|capire|errore|error/i.test(textContent);

      if (isShort || looksLost) {
        console.warn(`[🧠 Smart] Ollama ha risposto senza tool_use (testo: "${textContent.slice(0,80)}…") → escalation Anthropic`);
        trackCall('smart_escalated', params.max_tokens || 1000);
        return anthropicCreate(params);
      }
    }

    // Ollama ha risposto bene — gratis ✓
    console.log(`[🧠 Smart] Ollama OK ${hasToolCalls ? '(tool_use)' : '(text)'} — $0`);
    trackCall('smart_local', params.max_tokens || 1000);
    return ollamaResult;

  } catch (ollamaErr) {
    console.warn(`[🧠 Smart] Ollama errore: ${ollamaErr.message} → escalation Anthropic`);
    trackCall('smart_escalated', params.max_tokens || 1000);
    return anthropicCreate(params);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Unified create() — firma identica all'Anthropic SDK.
 * agent.js chiama: await llm.create({ max_tokens, system, messages, tools })
 */
export async function create(params) {
  if (PROVIDER === 'anthropic')  { trackCall('anthropic', params.max_tokens || 1000); return anthropicCreate(params); }
  if (PROVIDER === 'ollama')     { trackCall('ollama',    params.max_tokens || 1000); return ollamaCreate(params); }
  if (PROVIDER === 'trihybrid')  { trackCall('trihybrid', params.max_tokens || 1000); return trihybridCreate(params); }
  if (PROVIDER === 'smart')      return smartCreate(params);
  throw new Error(`[llm-provider] PROVIDER non riconosciuto: "${PROVIDER}". Usa "anthropic", "ollama", "trihybrid" o "smart".`);
}

/**
 * Info sul provider attivo — usato da server.js per mostrarla nella UI.
 */
export function providerInfo() {
  if (PROVIDER === 'anthropic')  return { provider: 'anthropic', model: ANTHROPIC_MODEL };
  if (PROVIDER === 'trihybrid')  return { provider: 'trihybrid', bridge: THY_BRIDGE_URL, model: 'auto-routed' };
  if (PROVIDER === 'smart')      return { provider: 'smart', local: OLLAMA_MODEL, cloud: ANTHROPIC_MODEL, strategy: 'ollama-first, anthropic-fallback' };
  return { provider: 'ollama', model: OLLAMA_MODEL, base: OLLAMA_BASE };
}

export default { create, providerInfo, getSessionStats };
