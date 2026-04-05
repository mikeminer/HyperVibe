/**
 * llm-provider.js — Unified LLM adapter per HyperVibe
 *
 * PROVIDER=ollama     → Ollama locale, modello da OLLAMA_MODEL
 * PROVIDER=anthropic  → Anthropic API, richiede ANTHROPIC_API_KEY
 *
 * Output sempre in formato Anthropic:
 *   { content: [ {type:'text'|'tool_use', ...} ], stop_reason: '...' }
 *
 * Node 18+ ha fetch globale — non serve node-fetch.
 */

const PROVIDER        = (process.env.PROVIDER || 'ollama').toLowerCase();
const OLLAMA_BASE     = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL    = process.env.OLLAMA_MODEL || 'qwen2.5:14b';
const ANTHROPIC_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

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

// ─── Response: OpenAI format → Anthropic format ───────────────────────────────

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

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Unified create() — firma identica all'Anthropic SDK.
 * agent.js chiama: await llm.create({ max_tokens, system, messages, tools })
 */
export async function create(params) {
  if (PROVIDER === 'anthropic') return anthropicCreate(params);
  if (PROVIDER === 'ollama')    return ollamaCreate(params);
  throw new Error(`[llm-provider] PROVIDER non riconosciuto: "${PROVIDER}". Usa "anthropic" o "ollama".`);
}

/**
 * Info sul provider attivo — usato da server.js per mostrarla nella UI.
 */
export function providerInfo() {
  if (PROVIDER === 'anthropic') return { provider: 'anthropic', model: ANTHROPIC_MODEL };
  return { provider: 'ollama', model: OLLAMA_MODEL, base: OLLAMA_BASE };
}

export default { create, providerInfo };
