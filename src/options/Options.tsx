import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Chip,
  ThemeProvider,
  createTheme,
  TextField,
  MenuItem,
  Stack,
  IconButton,
  Divider,
  Switch,
  FormControlLabel,
} from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { logError } from '../features/logging';
import LogViewer from '../features/logging';
import {
  FactCheckLanguage,
  LANGUAGE_LABELS,
  FactCheckConfig,
  ProviderId,
  callProvider,
  normalizeFactCheckConfigs,
} from '../features/fact-check';
import { BlockUserList } from '../features/block-user';

type BlockedUser = { id: string; name: string };

type ProviderConfig = {
  provider: ProviderId | '';
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  language?: FactCheckLanguage;
};

const PROVIDER_LABELS: Record<ProviderId, string> = {
  claude: 'Claude',
  local: 'Local (Ollama / Qwen / llama.cpp, free)',
  gemini: 'Gemini (Google)',
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  openrouter: 'OpenRouter',
  other: 'Other (OpenAI-compatible)',
};

const PROVIDER_OPTIONS: ProviderId[] = [
  'claude',
  'local',
  'gemini',
  'openai',
  'deepseek',
  'openrouter',
  'other',
];

const defaultModelFor = (provider: ProviderId | ''): string => {
  switch (provider) {
    case 'gemini':
      return 'gemini-1.5-flash';
    case 'claude':
      return 'claude-3-5-sonnet-latest';
    case 'openrouter':
      return 'openai/gpt-4o-mini';
    case 'openai':
      return 'gpt-4o-mini';
    case 'deepseek':
      return 'deepseek-chat';
    case 'local':
      return 'llama3.1';
    default:
      return 'gpt-4o-mini';
  }
};

const providerValidationError = (cfg: ProviderConfig): string => {
  if (!cfg.provider) return '';

  if (cfg.provider === 'local') {
    if (!cfg.baseUrl?.trim()) {
      return 'Base URL is required for local providers.';
    }
  } else if (cfg.provider === 'other') {
    if (!cfg.apiKey?.trim()) {
      return 'API key is required for this provider.';
    }
    if (!cfg.baseUrl?.trim()) {
      return 'Base URL is required for this provider.';
    }
  } else {
    if (!cfg.apiKey?.trim()) {
      return 'API key is required for this provider.';
    }
  }

  return '';
};

const Options: React.FC = () => {
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  // Ordered list of providers. The first one is tried first; on failure the
  // next one is used as a fallback.
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [fcSaved, setFcSaved] = useState(false);
  // Per-attempt timeout in seconds (1–120). Each provider attempt is aborted
  // after this long and the next provider is tried as a fallback.
  const [timeoutSec, setTimeoutSec] = useState(9);
  // Whether fact-check feature is enabled.
  const [factCheckEnabled, setFactCheckEnabled] = useState(true);
  // Per-provider connection-test status keyed by provider index.
  const [testStatus, setTestStatus] = useState<
    Record<number, 'testing' | 'ok' | 'fail'>
  >({});
  const [testMsg, setTestMsg] = useState<Record<number, string>>({});

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.get({ zhihuBlockedUsers: [] }, (result) => {
        if (result.zhihuBlockedUsers)
          setBlocked(result.zhihuBlockedUsers as BlockedUser[]);
      });
      chrome.storage.sync.get(
        {
          factCheckConfigs: null,
          factCheckConfig: null,
          factCheckTimeoutSec: 9,
          factCheckEnabled: true,
        },
        (result) => {
          const configs = normalizeFactCheckConfigs(
            result.factCheckConfigs,
            result.factCheckConfig,
          );
          if (configs.length > 0) {
            setProviders(configs);
          }
          if (typeof result.factCheckTimeoutSec === 'number') {
            setTimeoutSec(result.factCheckTimeoutSec);
          }
          setFactCheckEnabled(result.factCheckEnabled as boolean);
        },
      );
    }
  }, []);

  const saveFcConfig = () => {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    // Persist only providers that have a provider selected.
    const toSave = providers.filter((p) => p.provider);
    const clamped = Math.min(Math.max(Number(timeoutSec) || 9, 1), 120);
    chrome.storage.sync.set(
      { factCheckConfigs: toSave, factCheckTimeoutSec: clamped, factCheckEnabled },
      () => setFcSaved(true),
    );
  };

  const unblockUser = (id: string) => {
    const updated = blocked.filter((u) => u.id !== id);
    setBlocked(updated);
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.set({ zhihuBlockedUsers: updated });
    }
  };

  const clearAllBlockedUsers = () => {
    setBlocked([]);
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.set({ zhihuBlockedUsers: [] });
    }
  };

  const updateProvider = (idx: number, patch: Partial<ProviderConfig>) => {
    setFcSaved(false);
    setProviders((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    );
  };

  const addProvider = () => {
    setFcSaved(false);
    setProviders((prev) => [...prev, { provider: '' }]);
  };

  const removeProvider = (idx: number) => {
    setFcSaved(false);
    setProviders((prev) => prev.filter((_, i) => i !== idx));
  };

  const moveProvider = (idx: number, dir: -1 | 1) => {
    setFcSaved(false);
    setProviders((prev) => {
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  // Probe a single provider config with a tiny test prompt. Failures are
  // logged via the shared logger (see providers.ts) and surfaced inline.
  const testProvider = async (idx: number) => {
    const cfg = providers[idx];
    if (!cfg || !cfg.provider) return;
    setFcSaved(false);
    setTestStatus((s) => ({ ...s, [idx]: 'testing' }));
    setTestMsg((m) => ({ ...m, [idx]: '' }));
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9000);
      try {
        const res = await callProvider(
          'Connection test.',
          undefined,
          cfg as FactCheckConfig,
          controller.signal,
        );
        if (res.ok) {
          setTestStatus((s) => ({ ...s, [idx]: 'ok' }));
          setTestMsg((m) => ({ ...m, [idx]: 'Connected successfully.' }));
        } else {
          setTestStatus((s) => ({ ...s, [idx]: 'fail' }));
          setTestMsg((m) => ({ ...m, [idx]: res.error }));
        }
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logError(
        `Fact-check connection test failed for "${cfg.provider}"`,
        message,
      );
      setTestStatus((s) => ({ ...s, [idx]: 'fail' }));
      setTestMsg((m) => ({ ...m, [idx]: message }));
    }
  };

  return (
    <ThemeProvider theme={createTheme()}>
      <Paper sx={{ p: 2 }} elevation={0}>
        <BlockUserList
          blocked={blocked}
          onUnblock={unblockUser}
          onClearAll={clearAllBlockedUsers}
        />

        <Divider sx={{ my: 3 }} />

        <Typography variant="h5" gutterBottom>
          Fact Check (AI)
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Send an answer or question to one or more AI providers for a
          structured analysis (Validity vs. Truth, Ethos/Pathos/Logos, and
          informal fallacies). Providers are tried in the order listed below. If
          one fails (e.g. rate limit, bad key, server error), the next provider
          is used as a fallback. The API key stays in chrome.storage and is only
          used by the background service worker.
        </Typography>

        <Box sx={{ mt: 2, mb: 2 }}>
          <FormControlLabel
            control={
              <Switch
                checked={factCheckEnabled}
                onChange={(e) => {
                  setFcSaved(false);
                  setFactCheckEnabled(e.target.checked);
                }}
              />
            }
            label="Enable Fact Check"
            labelPlacement="end"
          />
        </Box>

        <Box sx={{ mt: 2 }}>
          {providers.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              No providers configured. Add one to enable fact-checking.
            </Typography>
          )}

          <Stack spacing={2}>
            {providers.map((cfg, idx) => {
              const validationError = providerValidationError(cfg);
              return (
                <Paper key={idx} variant="outlined" sx={{ p: 2 }}>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      mb: 1,
                    }}
                  >
                    <Chip
                      size="small"
                      color="primary"
                      label={`#${idx + 1}${idx === 0 ? ' (primary)' : ' (fallback)'}`}
                    />
                    <Box>
                      <IconButton
                        size="small"
                        onClick={() => moveProvider(idx, -1)}
                        disabled={idx === 0}
                        aria-label="Move up"
                      >
                        <ArrowUpwardIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => moveProvider(idx, 1)}
                        disabled={idx === providers.length - 1}
                        aria-label="Move down"
                      >
                        <ArrowDownwardIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => removeProvider(idx)}
                        aria-label="Remove"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>

                  <Stack spacing={2} sx={{ maxWidth: 420 }}>
                    <TextField
                      select
                      label="Provider"
                      value={cfg.provider}
                      onChange={(e) => {
                        const provider = e.target
                          .value as ProviderConfig['provider'];
                        // Reset model placeholder hint when provider changes.
                        updateProvider(idx, {
                          provider,
                          model: cfg.model || '',
                        });
                      }}
                    >
                      <MenuItem value="">Disabled</MenuItem>
                      {PROVIDER_OPTIONS.map((p) => (
                        <MenuItem key={p} value={p}>
                          {PROVIDER_LABELS[p]}
                        </MenuItem>
                      ))}
                    </TextField>

                    {cfg.provider === 'local' && (
                      <>
                        <TextField
                          label="Base URL"
                          placeholder="http://127.0.0.1:11434/v1"
                          value={cfg.baseUrl || ''}
                          onChange={(e) =>
                            updateProvider(idx, { baseUrl: e.target.value })
                          }
                        />
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ mt: -1, mb: 1 }}
                        >
                          For Ollama: allow CORS from the extension by running
                          <code
                            style={{
                              marginLeft: '4px',
                              fontFamily: 'monospace',
                            }}
                          >
                            {'launchctl setenv OLLAMA_ORIGINS "*"'}
                          </code>
                          (macOS) or set{' '}
                          <code
                            style={{
                              marginLeft: '4px',
                              fontFamily: 'monospace',
                            }}
                          >
                            {'OLLAMA_ORIGINS=*'}
                          </code>{' '}
                          in your environment.
                        </Typography>
                      </>
                    )}

                    {(cfg.provider === 'claude' ||
                      cfg.provider === 'gemini' ||
                      cfg.provider === 'openai' ||
                      cfg.provider === 'deepseek' ||
                      cfg.provider === 'openrouter' ||
                      cfg.provider === 'other') && (
                        <TextField
                          label="API Key"
                          type="password"
                          value={cfg.apiKey || ''}
                          onChange={(e) =>
                            updateProvider(idx, { apiKey: e.target.value })
                          }
                        />
                      )}

                    {cfg.provider === 'other' && (
                      <TextField
                        label="Base URL"
                        placeholder="https://api.openai.com/v1"
                        value={cfg.baseUrl || ''}
                        onChange={(e) =>
                          updateProvider(idx, { baseUrl: e.target.value })
                        }
                      />
                    )}

                    <TextField
                      label="Model"
                      placeholder={defaultModelFor(cfg.provider)}
                      value={cfg.model || ''}
                      onChange={(e) =>
                        updateProvider(idx, { model: e.target.value })
                      }
                    />

                    <TextField
                      select
                      label="Reply language"
                      value={cfg.language || 'en'}
                      onChange={(e) =>
                        updateProvider(idx, {
                          language: e.target.value as FactCheckLanguage,
                        })
                      }
                    >
                      {(
                        Object.keys(LANGUAGE_LABELS) as FactCheckLanguage[]
                      ).map((lang) => (
                        <MenuItem key={lang} value={lang}>
                          {LANGUAGE_LABELS[lang]}
                        </MenuItem>
                      ))}
                    </TextField>

                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        mt: 1,
                      }}
                    >
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => testProvider(idx)}
                        disabled={
                          !cfg.provider || testStatus[idx] === 'testing'
                        }
                      >
                        {testStatus[idx] === 'testing'
                          ? 'Testing…'
                          : 'Test connection'}
                      </Button>
                      {testStatus[idx] === 'ok' && (
                        <Typography variant="body2" color="success.main">
                          {testMsg[idx]}
                        </Typography>
                      )}
                      {testStatus[idx] === 'fail' && (
                        <Typography variant="body2" color="error">
                          {testMsg[idx]}
                        </Typography>
                      )}
                    </Box>
                    {validationError && (
                      <Typography variant="body2" color="error">
                        {validationError}
                      </Typography>
                    )}
                  </Stack>
                </Paper>
              );
            })}
          </Stack>

          <Button
            variant="outlined"
            size="small"
            startIcon={<AddIcon />}
            onClick={addProvider}
            sx={{ mt: 2 }}
          >
            Add provider
          </Button>

          <Box sx={{ mt: 2, maxWidth: 420 }}>
            <TextField
              label="Timeout per provider (seconds)"
              type="number"
              fullWidth
              value={timeoutSec}
              slotProps={{ htmlInput: { min: 1, max: 120, step: 1 } }}
              helperText="Each provider attempt is aborted after this many seconds; the next provider is then tried. Range 1–120."
              onChange={(e) => {
                setFcSaved(false);
                setTimeoutSec(Number(e.target.value));
              }}
            />
          </Box>

          <Box sx={{ mt: 2 }}>
            <Button
              variant="contained"
              size="small"
              onClick={saveFcConfig}
              disabled={providers.every((cfg) => !cfg.provider)}
            >
              Save
            </Button>
            {fcSaved && (
              <Typography
                variant="body2"
                color="success.main"
                sx={{ ml: 1, display: 'inline' }}
              >
                Saved.
              </Typography>
            )}
          </Box>
        </Box>

        <Divider sx={{ my: 3 }} />

        <LogViewer />
      </Paper>
    </ThemeProvider>
  );
};

export default Options;