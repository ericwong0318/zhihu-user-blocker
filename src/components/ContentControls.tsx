import React from 'react';
import { createPortal } from 'react-dom';
import { Box, ThemeProvider, createTheme } from '@mui/material';
import { useBlockUser, BlockButton } from '../features/block-user';
import { FactCheckButton, useFactCheckRunner, useFactCheckContainers, useFactCheckConfig } from '../features/fact-check';
import { useZhihuContent } from '../hooks/useZhihuContent';

/**
 * Main wrapper that composes both Block User and Fact Check controls.
 * Delegates logic to hooks; this file only renders UI.
 */
export const ContentControls: React.FC = () => {
  const { blocked, users, blockContainers, blockUser, unblockUser } = useBlockUser();
  const { contents } = useZhihuContent();
  const { factCheckEnabled, hasProviders, language } = useFactCheckConfig();
  const runFactCheck = useFactCheckRunner(language);
  const fcContainers = useFactCheckContainers(contents);

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
        {/* Block buttons for users without answer content */}
        {users.map((user) => {
          const hasContent = contents.some((c) => c.element.contains(user.element));
          if (hasContent) return null;
          const container = blockContainers.get(user.id);
          if (!container) return null;
          const isBlocked = blocked.some((u) => u.id === user.id);
          return createPortal(
            <BlockButton
              isBlocked={isBlocked}
              onBlock={() => blockUser(user.id, user.name)}
              onUnblock={() => unblockUser(user.id)}
            />,
            container
          );
        })}

        {/* Combined controls for each answer content */}
        {contents.map((content) => {
          const container = fcContainers.get(content.id);
          if (!container) return null;
          const user = users.find((u) => content.element.contains(u.element));
          const isBlocked = user ? blocked.some((u) => u.id === user.id) : false;
          return createPortal(
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              <BlockButton
                isBlocked={isBlocked}
                onBlock={() => user && blockUser(user.id, user.name)}
                onUnblock={() => user && unblockUser(user.id)}
              />
              {factCheckEnabled && (
                <FactCheckButton
                  enabled={hasProviders}
                  text={content.text}
                  question={content.question}
                  onFactCheck={runFactCheck}
                />
              )}
            </Box>,
            container
          );
        })}
      </Box>
    </ThemeProvider>
  );
};
