// Test script for phone number normalization
function normalizePhone(phone) {
  // Remove all non-digit characters except the leading +
  // This handles formats like: +998 97 912 61 61, +998-97-912-61-61, +998 (97) 912-61-61
  let normalized = phone.trim();

  // Keep only digits and the + sign
  normalized = normalized.replace(/[^\d+]/g, "");

  // Ensure it starts with +998
  if (normalized.startsWith("998") && !normalized.startsWith("+998")) {
    normalized = "+" + normalized;
  }

  return normalized;
}

// Test cases
const testNumbers = [
  "+998 979126161", // Telegram format with spaces
  "+998979126161", // Standard format
  "+998 97 912 61 61", // Multiple spaces
  "+998-97-912-61-61", // Dashes
  "+998 (97) 912-61-61", // Parentheses and dashes
  "998979126161", // Without + sign
  "+998  97  912  61  61", // Multiple spaces
];

console.log("📱 Phone Number Normalization Tests:\n");

testNumbers.forEach((phone) => {
  const normalized = normalizePhone(phone);
  const isValid = /^\+998\d{9}$/.test(normalized);
  const status = isValid ? "✅" : "❌";
  console.log(`${status} Input:  "${phone}"`);
  console.log(`   Output: "${normalized}"`);
  console.log(`   Valid:  ${isValid}\n`);
});
