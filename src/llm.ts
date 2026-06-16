import Constants from 'expo-constants';

/**
 * Optional cloud categoriser backed by a self-hosted OpenAI-compatible LLM
 * (e.g. Qwen). Used only as a fallback for merchants/senders the on-device
 * rules and model can't categorise. Returns a merchant → category-key map;
 * returns {} (no-op) when unconfigured or on any error, so the app degrades
 * gracefully to the local layers.
 */

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
const LLM_URL = extra.llmApiUrl || '';
const LLM_KEY = extra.llmApiKey || '';
const LLM_MODEL = extra.llmModel || '';

const VALID = new Set([
  'food', 'groceries', 'shopping', 'transport', 'tuition',
  'entertainment', 'health', 'rent', 'bills', 'transfers', 'upi', 'maid',
]);

const SYSTEM =
  'You categorise Indian personal-finance transactions by merchant/sender name. ' +
  'Choose exactly one category key for each, from this list:\n' +
  'food (food & dining), groceries, shopping (retail/fashion/electronics), transport (cabs/fuel/travel), ' +
  'tuition (education/fees), entertainment (OTT/movies/games), health (pharmacy/clinic/gym), rent, ' +
  'bills (utilities/recharge/insurance/EMI), transfers (person-to-person money transfer), ' +
  'upi (BHIM/UPI wallet recharge), maid (domestic help / maid salary).\n' +
  'Respond with ONLY a compact JSON object mapping each input string to its category key. No prose, no code fences.';

export function llmConfigured(): boolean {
  return !!(LLM_URL && LLM_KEY && LLM_MODEL);
}

export async function llmCategorize(merchants: string[]): Promise<Record<string, string>> {
  if (!llmConfigured() || merchants.length === 0) return {};
  try {
    const res = await fetch(LLM_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${LLM_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: LLM_MODEL,
        temperature: 0,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `Categorise: ${JSON.stringify(merchants)}` },
        ],
      }),
    });
    if (!res.ok) return {};
    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content || '';
    const match = text.replace(/```json|```/gi, '').match(/\{[\s\S]*\}/);
    if (!match) return {};
    const parsed = JSON.parse(match[0]);
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && VALID.has(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}
