/** Digits that follow the fixed +95 prefix. */
export function nationalPhoneDigits(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("95")) digits = digits.slice(2);
  digits = digits.replace(/^0+/, "");
  return digits.slice(0, 11);
}

export function toMyanmarPhone(digits: string): string {
  return "+95" + nationalPhoneDigits(digits);
}

export function isMyanmarPhone(phone: string): boolean {
  return /^\+95[1-9]\d{6,10}$/.test(phone);
}
