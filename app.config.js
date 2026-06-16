// Expo dynamic config: starts from app.json and merges local secrets (the LLM
// API token) from khaata.secrets.json, which is gitignored so secrets never get
// committed. Copy khaata.secrets.example.json → khaata.secrets.json and fill it
// in. Without it, the LLM email-categorisation fallback simply stays disabled.
const base = require('./app.json').expo;

let secrets = {};
try {
  secrets = require('./khaata.secrets.json');
} catch (e) {
  // No secrets file — fine; cloud LLM fallback is just disabled.
}

module.exports = {
  ...base,
  extra: { ...(base.extra || {}), ...secrets },
};
