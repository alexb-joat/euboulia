// Port of the Trioditis built-in detectors (trioditis/security.py). Returns
// detector names only, never the matched text. Deliberately conservative.
const BUILTIN: Record<string, RegExp> = {
  email: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/,
  card_number: /\b(?:\d[ -]?){13,19}\b/g,
  iban: /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}\b/,
  us_ssn: /\b\d{3}-\d{2}-\d{4}\b/,
  api_key: /\b(?:sk-[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|xox[bpas]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35})\b/,
  private_key: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  password_assignment: /\b(password|passwd|pwd)\s*[:=]\s*\S+/i,
};

export function luhnOk(digits: string): boolean {
  const nums = [...digits].filter(c => c >= '0' && c <= '9').map(Number);
  if (nums.length < 13 || nums.length > 19) return false;
  let total = 0;
  nums.reverse().forEach((n, i) => {
    if (i % 2) { n *= 2; if (n > 9) n -= 9; }
    total += n;
  });
  return total % 10 === 0;
}

export function detectSensitive(text: string): string[] {
  if (!text) return [];
  const hits: string[] = [];
  for (const [name, rx] of Object.entries(BUILTIN)) {
    if (name === 'card_number') {
      const all = text.match(rx) ?? [];
      if (all.some(luhnOk)) hits.push(name);
    } else if (rx.test(text)) {
      hits.push(name);
    }
  }
  return hits;
}
