import { useState, useEffect } from 'react';

export const currencies: Record<string, { symbol: string; code: string; name: string }> = {
  USD: { symbol: '$',   code: 'USD', name: 'US Dollar' },
  UGX: { symbol: 'USh', code: 'UGX', name: 'Ugandan Shilling' },
  KES: { symbol: 'KSh', code: 'KES', name: 'Kenyan Shilling' },
  TZS: { symbol: 'TSh', code: 'TZS', name: 'Tanzanian Shilling' },
  GHS: { symbol: 'GH₵', code: 'GHS', name: 'Ghanaian Cedi' },
  NGN: { symbol: '₦',   code: 'NGN', name: 'Nigerian Naira' },
  ZAR: { symbol: 'R',   code: 'ZAR', name: 'South African Rand' },
  GBP: { symbol: '£',   code: 'GBP', name: 'British Pound' },
  EUR: { symbol: '€',   code: 'EUR', name: 'Euro' },
};

export type CurrencyCode = keyof typeof currencies;

const CURRENCY_KEY = 'schofy_currency';

function getCurrencyFromStorage(): { symbol: string; code: string; name: string } {
  const stored = localStorage.getItem(CURRENCY_KEY);
  return (stored && currencies[stored]) ? currencies[stored] : currencies.USD;
}

export function useCurrency() {
  const [currency, setCurrencyState] = useState(getCurrencyFromStorage);

  useEffect(() => {
    function sync() {
      setCurrencyState(getCurrencyFromStorage());
    }

    // Listen for local changes
    window.addEventListener('storage', sync);
    window.addEventListener('currencyChanged', sync);

    // Listen for settings saved (includes currency key from Supabase)
    function onSettings(e: Event) {
      const detail = (e as CustomEvent).detail;
      const code = detail?.currency || detail?.value;
      if (code && currencies[code]) {
        localStorage.setItem(CURRENCY_KEY, code);
        setCurrencyState(currencies[code]);
      }
    }
    window.addEventListener('settingsUpdated', onSettings);

    // Listen for realtime settings changes from other devices
    function onDataRefresh(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail?.table === 'settings') {
        // Re-read from localStorage (Settings page updates it on save)
        sync();
      }
    }
    window.addEventListener('schofyDataRefresh', onDataRefresh);

    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('currencyChanged', sync);
      window.removeEventListener('settingsUpdated', onSettings);
      window.removeEventListener('schofyDataRefresh', onDataRefresh);
    };
  }, []);

  function formatMoney(amount: number | undefined | null): string {
    const n = typeof amount === 'number' ? amount : 0;
    return `${currency.symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }

  function setCurrency(code: CurrencyCode) {
    const c = currencies[code];
    if (!c) return;
    localStorage.setItem(CURRENCY_KEY, code);
    setCurrencyState(c);
    window.dispatchEvent(new Event('currencyChanged'));
    window.dispatchEvent(new CustomEvent('settingsUpdated', { detail: { currency: code } }));
  }

  return { currency, setCurrency, formatMoney };
}
