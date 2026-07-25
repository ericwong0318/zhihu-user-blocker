import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Button,
  Chip,
  Popover,
  Typography,
  Divider,
  Tooltip,
  ThemeProvider,
  createTheme,
} from '@mui/material';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import {
  FactCheckResult,
  FactCheckResultWithProvider,
  Verdict,
  FactCheckLanguage,
} from '../prompt';
import { runFactCheckPipeline } from '../pipeline';
import { normalizeFactCheckConfigs } from '../storage';

const VERDICT_COLOR: Record<Verdict, 'success' | 'warning' | 'default'> = {
  credible: 'success',
  misleading: 'warning',
  unverified: 'default',
};

const VERDICT_LABEL: Record<Verdict, string> = {
  credible: 'Credible',
  misleading: 'Misleading',
  unverified: 'Unverified',
};

type Props = {
  text: string;
  // Whether a provider is configured in Options. When false, the button is
  // disabled and explains where to set one up.
  enabled: boolean;
  // Talks to the background service worker. Accepts an onStage callback so the
  // UI can stream live "AI thinking" stages as they happen.
  onFactCheck: (
    text: string,
    onStage?: (stage: string, isRetry?: boolean) => void,
  ) => Promise<FactCheckResultWithProvider | { error: string }>;
};

const Section: React.FC<{ title: string; body: string }> = ({ title, body }) =>
  body ? (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {body}
      </Typography>
    </Box>
  ) : null;

const FactCheck: React.FC<Props> = ({ text, enabled, onFactCheck }) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FactCheckResult | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<FactCheckLanguage>('en');
  // Streaming AI thinking text - accumulates as it streams
  const [thinkingText, setThinkingText] = useState<string>('');
  // The primary (first) configured provider, used to label the live stage.
  const [providerInfo, setProviderInfo] = useState<{
    provider?: string;
    model?: string;
  } | null>(null);
  // Ref to the thinking text container for auto-scrolling
  const thinkingRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when thinking text updates
  const scrollToBottom = useCallback(() => {
    if (thinkingRef.current) {
      thinkingRef.current.scrollTop = thinkingRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [thinkingText, scrollToBottom]);

  useEffect(() => {
    if (
      typeof chrome === 'undefined' ||
      !chrome.storage ||
      !chrome.storage.sync
    )
      return;

    const applyProviderConfig = (stored: {
      factCheckConfigs: unknown | null;
      factCheckConfig: unknown | null;
    }) => {
      const configs = normalizeFactCheckConfigs(
        stored.factCheckConfigs,
        stored.factCheckConfig,
      );
      if (configs.length > 0) {
        setLanguage(configs[0].language || 'en');
        setProviderInfo({
          provider: configs[0].provider,
          model: configs[0].model,
        });
      } else {
        setLanguage('en');
        setProviderInfo(null);
      }
    };

    chrome.storage.sync.get(
      { factCheckConfigs: null, factCheckConfig: null },
      (result: {
        factCheckConfigs: unknown | null;
        factCheckConfig: unknown | null;
      }) => {
        applyProviderConfig(result);
      },
    );

    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string,
    ) => {
      if (area !== 'sync') return;

      if (changes.factCheckConfigs || changes.factCheckConfig) {
        const stored = {
          factCheckConfigs: changes.factCheckConfigs?.newValue ?? null,
          factCheckConfig: changes.factCheckConfig?.newValue ?? null,
        };
        applyProviderConfig(stored);
      }
    };

    if (chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    }
  }, []);

  const open = Boolean(anchor);

  const handleClick = async (e: React.MouseEvent<HTMLElement>) => {
    setAnchor(e.currentTarget);
    if (result || error) return; // already fetched, just show popover
    setLoading(true);
    setError(null);
    setThinkingText('');
    try {
      const onStage = (s: string, isRetry?: boolean) => {
        // Enrich the provider label when the background worker reports
        // "Contacting AI provider…" — substitute the locally-known provider.
        let display = s;
        if (
          s.startsWith('Contacting AI provider…') &&
          providerInfo?.provider
        ) {
          const model = providerInfo.model ? ` (${providerInfo.model})` : '';
          display = `Contacting ${providerInfo.provider}${model}…`;
        }
        // Append to thinking text with a newline, prefix with retry indicator if needed
        setThinkingText((prev) => {
          const prefix = isRetry ? 'Retrying… ' : '';
          const newLine = prev ? '\n\n' : '';
          return `${prev}${newLine}${prefix}${display}`;
        });
      };
      const res = await runFactCheckPipeline(
        text,
        language,
        onFactCheck,
        onStage,
      );
      if ('error' in res && typeof res.error === 'string') {
        setError(res.error);
      } else if ('error' in res) {
        setError(String(res.error));
      } else {
        setResult(res);
        // Surface which provider actually answered (may be a fallback).
        setProvider(res.provider ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setAnchor(null);
    setThinkingText('');
  };

  return (
    <ThemeProvider theme={createTheme()}>
      <Box
        component="span"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          ml: 0.75,
          verticalAlign: 'middle',
        }}
      >
        <Tooltip
          title={
            enabled ? 'AI fact-check this answer' : 'Configure a provider in Options'
          }
        >
          <Box component="span">
            <Button
              size="small"
              variant="outlined"
              startIcon={<FactCheckIcon />}
              onClick={handleClick}
              disabled={!enabled}
            >
              Fact Check
            </Button>
          </Box>
        </Tooltip>

        <Popover
          open={open}
          anchorEl={anchor}
          onClose={handleClose}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
          slotProps={{
            paper: {
              sx: { p: 2, maxWidth: 360, maxHeight: 420, overflowY: 'auto' },
            },
          }}
        >
          {loading && (
            <Box sx={{ width: '100%', minWidth: 240 }}>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mb: 0.5 }}
              >
                AI is thinking…
              </Typography>
              <Box
                ref={thinkingRef}
                sx={{
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                  lineHeight: 1.6,
                  color: 'text.primary',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  minHeight: 60,
                  maxHeight: 200,
                  overflowY: 'auto',
                  borderLeft: '3px solid',
                  borderColor: 'primary.main',
                  pl: 1.5,
                  py: 0.5,
                  backgroundColor: 'action.hover',
                  borderRadius: 1,
                }}
              >
                {thinkingText || <Typography color="text.secondary" variant="body2">Starting analysis…</Typography>}
              </Box>
            </Box>
          )}

          {!loading && error && (
            <Typography variant="body2" color="error">
              {error}
            </Typography>
          )}

          {!loading && result && (
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Fact Check
                </Typography>
                <Chip
                  size="small"
                  label={VERDICT_LABEL[result.verdict]}
                  color={VERDICT_COLOR[result.verdict]}
                />
                {provider && (
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`via ${provider}`}
                  />
                )}
              </Box>
              <Divider sx={{ mb: 1.5 }} />

              <Section
                title="Formal Logic — Validity vs. Truth"
                body={result.validityVsTruth}
              />
              <Section title="Ethos (Credibility)" body={result.rhetoric.ethos} />
              <Section title="Pathos (Emotion)" body={result.rhetoric.pathos} />
              <Section
                title="Logos (Logic / Reason)"
                body={result.rhetoric.logos}
              />

              {result.fallacies.length > 0 && (
                <Box sx={{ mb: 1.5 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Informal Fallacies
                  </Typography>
                  {result.fallacies.map((f, i) => (
                    <Box key={i} sx={{ mb: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {f.name}
                      </Typography>
                      {f.quote && (
                        <Typography
                          variant="body2"
                          component="blockquote"
                          sx={{
                            borderLeft: '3px solid',
                            borderColor: 'divider',
                            pl: 1,
                            my: 0.5,
                          }}
                        >
                          “{f.quote}”
                        </Typography>
                      )}
                      <Typography variant="body2" color="text.secondary">
                        {f.explanation}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}

              {result.sources && result.sources.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Sources
                  </Typography>
                  {result.sources.map((s, i) => (
                    <Typography
                      key={i}
                      variant="body2"
                      component="a"
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {s.title || s.url}
                    </Typography>
                  ))}
                </Box>
              )}
            </Box>
          )}
        </Popover>
      </Box>
    </ThemeProvider>
  );
};

export default FactCheck;
