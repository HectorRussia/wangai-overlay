export function validatePortableVersion(value) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) throw Error('Portable version must be a numeric major.minor.patch without leading zeroes');
  const parts = value.split('.').map(Number);
  if (parts.some(n => !Number.isSafeInteger(n)) || (parts[0] === 0 && parts[1] < 3)) throw Error('Portable version must be at least 0.3.0');
  return value;
}
