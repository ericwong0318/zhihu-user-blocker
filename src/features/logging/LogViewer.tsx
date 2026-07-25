import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  List,
  ListItem,
  ListItemText,
  Divider,
  Chip,
  Collapse,
  IconButton,
  Paper,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { getLogs, clearLogs, LogEntry } from './logger';

const LogViewer: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      getLogs().then(setLogs);
    }
  }, []);

  const refreshLogs = () => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      getLogs().then(setLogs);
    }
  };

  const clearLog = () => {
    clearLogs().then(() => setLogs([]));
  };

  const handleExpandClick = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  const isAiProviderLog = (log: LogEntry) => log.level === 'ai-provider';

  const formatJson = (obj: unknown): string => {
    if (obj === undefined || obj === null) return '';
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(obj);
    }
  };

  const renderAiProviderDetails = (log: LogEntry): React.ReactNode => {
    const details: React.ReactNode[] = [];

    if (log.provider) {
      details.push(
        <Typography variant="body2" color="text.secondary" gutterBottom key="provider">
          <strong>Provider:</strong> {log.provider}
          {log.model && <span> | <strong>Model:</strong> {log.model}</span>}
          {log.providerSequence && <span> | <strong>Sequence:</strong> #{log.providerSequence}</span>}
          {log.fallbackFrom && <span> | <strong>Fallback from:</strong> {log.fallbackFrom}</span>}
        </Typography>
      );
    }

    if (log.status) {
      details.push(
        <Typography variant="body2" color="text.secondary" gutterBottom key="status">
          <strong>Status:</strong>{' '}
          <Chip
            label={log.status}
            size="small"
            color={
              log.status === 'success' ? 'success' :
              log.status === 'failed' ? 'error' :
              log.status === 'timeout' ? 'warning' :
              'default'
            }
          />
        </Typography>
      );
    }

    if (log.durationMs) {
      details.push(
        <Typography variant="body2" color="text.secondary" gutterBottom key="duration">
          <strong>Duration:</strong> {log.durationMs}ms
        </Typography>
      );
    }

    if (log.tokenUsage) {
      details.push(
        <Typography variant="body2" color="text.secondary" gutterBottom key="tokens">
          <strong>Tokens:</strong>{' '}
          {log.tokenUsage.promptTokens && `prompt: ${log.tokenUsage.promptTokens}`}
          {log.tokenUsage.completionTokens && `, completion: ${log.tokenUsage.completionTokens}`}
          {log.tokenUsage.totalTokens && `, total: ${log.tokenUsage.totalTokens}`}
        </Typography>
      );
    }

    if (log.prompt) {
      details.push(
        <Box sx={{ mt: 1 }} key="prompt">
          <Typography variant="caption" color="text.secondary" gutterBottom>
            <strong>Prompt:</strong>
          </Typography>
          <Paper
            variant="outlined"
            sx={{
              p: 1,
              fontFamily: 'monospace',
              fontSize: '0.75rem',
              maxHeight: 200,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              backgroundColor: 'grey.50',
            }}
          >
            {log.prompt}
          </Paper>
        </Box>
      );
    }

    if (log.response) {
      details.push(
        <Box sx={{ mt: 1 }} key="response">
          <Typography variant="caption" color="text.secondary" gutterBottom>
            <strong>Response:</strong>
          </Typography>
          <Paper
            variant="outlined"
            sx={{
              p: 1,
              fontFamily: 'monospace',
              fontSize: '0.75rem',
              maxHeight: 200,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              backgroundColor: 'grey.50',
            }}
          >
            {log.response}
          </Paper>
        </Box>
      );
    }

    if (log.requestBody) {
      details.push(
        <Box sx={{ mt: 1 }} key="requestBody">
          <Typography variant="caption" color="text.secondary" gutterBottom>
            <strong>Request Body:</strong>
          </Typography>
          <Paper
            variant="outlined"
            sx={{
              p: 1,
              fontFamily: 'monospace',
              fontSize: '0.75rem',
              maxHeight: 200,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              backgroundColor: 'grey.50',
            }}
          >
            {formatJson(log.requestBody)}
          </Paper>
        </Box>
      );
    }

    if (log.responseBody) {
      details.push(
        <Box sx={{ mt: 1 }} key="responseBody">
          <Typography variant="caption" color="text.secondary" gutterBottom>
            <strong>Response Body:</strong>
          </Typography>
          <Paper
            variant="outlined"
            sx={{
              p: 1,
              fontFamily: 'monospace',
              fontSize: '0.75rem',
              maxHeight: 200,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              backgroundColor: 'grey.50',
            }}
          >
            {formatJson(log.responseBody)}
          </Paper>
        </Box>
      );
    }

    return (
      <Box sx={{ mt: 1, ml: 2, borderLeft: '2px solid', borderColor: 'divider', pl: 2 }}>
        {details}
      </Box>
    );
  };

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Extension Logs
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        Recent logs captured locally by the extension (errors, warnings, AI provider interactions).
      </Typography>

      <Box sx={{ mt: 2 }}>
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <Button variant="outlined" size="small" onClick={refreshLogs}>
            Refresh
          </Button>
          <Button
            variant="outlined"
            color="error"
            size="small"
            onClick={clearLog}
            disabled={logs.length === 0}
          >
            Clear log
          </Button>
        </Box>

        {logs.length === 0 ? (
          <Typography variant="body1">No logs recorded.</Typography>
        ) : (
          <List disablePadding>
            {[...logs].reverse().map((log, idx) => (
              <React.Fragment key={`${log.time}-${idx}`}>
                {idx > 0 && <Divider component="li" />}
                <ListItem
                  alignItems="flex-start"
                  secondaryAction={
                    isAiProviderLog(log) ? (
                      <IconButton
                        edge="end"
                        onClick={() => handleExpandClick(idx)}
                        aria-expanded={expandedIndex === idx}
                        aria-controls={`ai-log-${idx}`}
                        aria-label="Show AI provider details"
                      >
                        <ExpandMoreIcon
                          sx={{
                            transform: expandedIndex === idx ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s',
                          }}
                        />
                      </IconButton>
                    ) : null
                  }
                >
                  <ListItemText
                    primary={
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}
                      >
                        <Chip
                          label={log.level}
                          size="small"
                          color={
                            log.level === 'error'
                              ? 'error'
                              : log.level === 'warn'
                                ? 'warning'
                                : log.level === 'ai-provider'
                                  ? 'info'
                                  : 'default'
                          }
                        />
                        <Typography component="span" variant="body2">
                          {new Date(log.time).toLocaleString()}
                        </Typography>
                        {log.provider && (
                          <Chip
                            label={log.provider}
                            size="small"
                            variant="outlined"
                            color="primary"
                          />
                        )}
                        {log.status && (
                          <Chip
                            label={log.status}
                            size="small"
                            variant="outlined"
                            color={
                              log.status === 'success' ? 'success' :
                              log.status === 'failed' ? 'error' :
                              log.status === 'timeout' ? 'warning' :
                              'default'
                            }
                          />
                        )}
                        {log.durationMs && (
                          <Typography variant="caption" color="text.secondary">
                            {log.durationMs}ms
                          </Typography>
                        )}
                      </Box>
                    }
                    secondary={
                      log.context
                        ? `${log.message} (${log.context})`
                        : log.message
                    }
                  />
                </ListItem>
                {isAiProviderLog(log) && (
                  <Collapse in={expandedIndex === idx} timeout="auto" unmountOnExit>
                    <ListItem
                      sx={{ px: 3 }}
                      secondaryAction={
                        <IconButton
                          edge="end"
                          onClick={() => handleExpandClick(idx)}
                          aria-expanded={expandedIndex === idx}
                          aria-controls={`ai-log-${idx}`}
                          aria-label="Hide AI provider details"
                        >
                          <ExpandMoreIcon
                            sx={{
                              transform: expandedIndex === idx ? 'rotate(180deg)' : 'rotate(0deg)',
                              transition: 'transform 0.2s',
                            }}
                          />
                        </IconButton>
                      }
                    >
                      <Box id={`ai-log-${idx}`} role="region">
                        {renderAiProviderDetails(log)}
                      </Box>
                    </ListItem>
                  </Collapse>
                )}
              </React.Fragment>
            ))}
          </List>
        )}
      </Box>
    </Box>
  );
};

export default LogViewer;