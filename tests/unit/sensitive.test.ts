import { describe, expect, it } from 'vitest';
import { detectSensitive, luhnOk } from '../../src/analyser/sensitive';

describe('detectSensitive', () => {
  it('finds the built-in detectors', () => {
    expect(detectSensitive('mail me at alex@example.com')).toEqual(['email']);
    expect(detectSensitive('IBAN GB82 WEST 1234 5698 7654 32')).toContain('iban');
    expect(detectSensitive('ssn 123-45-6789')).toContain('us_ssn');
    expect(detectSensitive('key sk-ant-abcdefghijklmnopqrstuvwxyz0123')).toContain('api_key');
    expect(detectSensitive('-----BEGIN RSA PRIVATE KEY-----')).toContain('private_key');
    expect(detectSensitive('password = s3cret')).toContain('password_assignment');
  });
  it('accepts a Luhn-valid card number and rejects an invalid one', () => {
    expect(luhnOk('4539 1488 0343 6467')).toBe(true);
    expect(luhnOk('4539 1488 0343 6468')).toBe(false);
    expect(detectSensitive('card 4539 1488 0343 6467')).toContain('card_number');
    expect(detectSensitive('order 4539 1488 0343 6468')).not.toContain('card_number');
  });
  it('is quiet on ordinary prose', () => {
    expect(detectSensitive('Write a regex for UK postcodes')).toEqual([]);
    expect(detectSensitive('')).toEqual([]);
  });
});
