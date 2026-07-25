import { useEffect, useState } from 'react';
import { normalizeFactCheckConfigs } from '../storage';

export const useFactCheckConfig = () => {
  const [factCheckEnabled, setFactCheckEnabled] = useState(false);
  const [language, setLanguage] = useState('en');

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    const load = () => {
      chrome.storage.sync.get({ factCheckConfigs: null, factCheckConfig: null }, (r) => {
        const cfgs = normalizeFactCheckConfigs(r.factCheckConfigs, r.factCheckConfig);
        setFactCheckEnabled(cfgs.length > 0);
        if (cfgs.length > 0) setLanguage(cfgs[0].language || 'en');
      });
    };
    load();
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'sync') return;
      if (changes.factCheckConfigs || changes.factCheckConfig) load();
    };
    if (chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    }
  }, []);

  return { factCheckEnabled, language, setFactCheckEnabled, setLanguage };
};
