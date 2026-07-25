import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  Chip,
  Popover,
  Typography,
  Divider,
  Tooltip,
} from '@mui/material';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import { useFactCheckAction } from '../hooks/useFactCheckAction';

const FACTCHECK_CLASS = 'zhihu-factcheck-inline';

export type FactCheckButtonProps = {
  enabled: boolean;
  text: string;
  question?: string;
  onFactCheck: (
    text: string,
    question?: string,
    onStage?: (stage: string, isRetry?: boolean) => void,
  ) => Promise<unknown>;
};

export const FactCheckButton: React.FC<FactCheckButtonProps> = ({
  enabled,
  text,
  question,
  onFactCheck,
}) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const {
    loading,
    result,
    provider,
    error,
    thinkingText,
    handleClick,
  } = useFactCheckAction();
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

  const onClick = async (e: React.MouseEvent<HTMLElement>) => {
    setAnchor(e.currentTarget);
    await handleClick(e, enabled, text, question, onFactCheck);
  };

  const open = Boolean(anchor);

  return (
    <Box
      component="span"
      className={FACTCHECK_CLASS}
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
            onClick={onClick}
            disabled={!enabled}
          >
            Fact Check
          </Button>
        </Box>
      </Tooltip>
      <Popover
        open={open}
        onClose={() => setAnchor(null)}
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
            <Box
              sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Fact Check
              </Typography>
              <Chip
                size="small"
                label={result.verdict}
                color={
                  result.verdict === 'credible'
                    ? 'success'
                    : result.verdict === 'misleading'
                    ? 'warning'
                    : 'default'
                }
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
            {result.validityVsTruth && (
              <Box sx={{ mb: 1.5 }}>
                <Typography
                  variant="subtitle2"
                  sx={{ fontWeight: 600 }}
                >
                  Formal Logic
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {result.validityVsTruth}
                </Typography>
              </Box>
            )}
            {result.rhetoric && (
              <>
                <Box sx={{ mb: 1 }}>
                  <Typography
                    variant="subtitle2"
                    sx={{ fontWeight: 600 }}
                  >
                    Ethos (Credibility)
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {result.rhetoric.ethos}
                  </Typography>
                </Box>
                <Box sx={{ mb: 1 }}>
                  <Typography
                    variant="subtitle2"
                    sx={{ fontWeight: 600 }}
                  >
                    Pathos (Emotion)
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {result.rhetoric.pathos}
                  </Typography>
                </Box>
                <Box sx={{ mb: 1 }}>
                  <Typography
                    variant="subtitle2"
                    sx={{ fontWeight: 600 }}
                  >
                    Logos (Logic)
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {result.rhetoric.logos}
                  </Typography>
                </Box>
              </>
            )}
            {result.fallacies && result.fallacies.length > 0 && (
              <Box sx={{ mb: 1.5 }}>
                <Typography
                  variant="subtitle2"
                  sx={{ fontWeight: 600 }}
                >
                  Informal Fallacies
                </Typography>
                {result.fallacies.map((f, i: number) => (
                  <Box key={i} sx={{ mb: 1 }}>
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 600 }}
                    >
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
                        }}
                      >
                        {f.quote}
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
                <Typography
                  variant="subtitle2"
                  sx={{ fontWeight: 600 }}
                >
                  Sources
                </Typography>
                {result.sources.map((s, i: number) => (
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
  );
};
