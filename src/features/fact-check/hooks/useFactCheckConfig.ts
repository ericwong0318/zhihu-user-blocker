import { useEffect, useState } from 'react';
import { normalizeFactCheckConfigs } from '../storage';

export const useFactCheckConfig = () => {
  const [factCheckEnabled, setFactCheckEnabled] = useState(false);
  const [hasProviders, setHasProviders] = useState(false);
  const [language, setLanguage] = useState('en');
  const [timeoutSec, setTimeoutSec] = useState(9);

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    const load = () => {
      chrome.storage.sync.get(
        { factCheckConfigs: null, factCheckConfig: null, factCheckEnabled: false, factCheckTimeoutSec: 9 },
        (r) => {
          const cfgs = normalizeFactCheckConfigs(r.factCheckConfigs, r.factCheckConfig);
          // User's explicit choice from the toggle
          setFactCheckEnabled(Boolean(r.factCheckEnabled));
          // Whether any providers are configured
          setHasProviders(cfgs.length > 0);
          if (cfgs.length > 0) setLanguage(cfgs[0].language || 'en');
          if (typeof r.factCheckTimeoutSec === 'number') {
            setTimeoutSec(r.factCheckTimeoutSec);
          }
        },
      );
    };
    load();
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'sync') return;
      if (changes.factCheckConfigs || changes.factCheckConfig || changes.factCheckEnabled || changes.factCheckTimeoutSec) load();
    };
    if (chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    }
  }, []);

  return { factCheckEnabled, hasProviders, language, timeoutSec, setFactCheckEnabled, setLanguage, setTimeoutSec };
};
