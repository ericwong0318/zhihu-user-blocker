import { logError } from './features/logging';
import { callProviders, normalizeFactCheckConfigs } from './features/fact-check';
import type { Request } from './types/request';
export { };

/** Message sent over the 'factCheck' port from the content script. */
interface FactCheckPortMessage {
  text: string;
  question?: string;
}

/** Type guard that validates an unknown port message at runtime. */
function isFactCheckPortMessage(msg: unknown): msg is FactCheckPortMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    typeof (msg as FactCheckPortMessage).text === 'string'
  );
}

// Open the options page (block list) when the extension icon is clicked.
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((request: Request, sender, sendResponse) => {
  try {
    if (request.action === 'blockUser') {
      // Store blocked users as {id, name} objects for a richer block list
      chrome.storage.sync.get({ zhihuBlockedUsers: [] }, (result) => {
        const list = result.zhihuBlockedUsers as { id: string; name: string }[];
        const entry = {
          id: request.userId,
          name: request.userName || request.userId,
        };
        // Avoid duplicates by id
        const updated = list.some((u) => u.id === entry.id)
          ? list
          : [...list, entry];
        chrome.storage.sync.set({ zhihuBlockedUsers: updated }, () => {
          sendResponse({ success: true });
        });
      });
      return true;
    }

    if (request.action === 'unblockUser') {
      chrome.storage.sync.get({ zhihuBlockedUsers: [] }, (result) => {
        const list = result.zhihuBlockedUsers as { id: string; name: string }[];
        const updated = list.filter((u) => u.id !== request.userId);
        chrome.storage.sync.set({ zhihuBlockedUsers: updated }, () => {
          sendResponse({ success: true });
        });
      });
      return true;
    }

    if (request.action === 'getBlockedUsers') {
      chrome.storage.sync.get({ zhihuBlockedUsers: [] }, (result) => {
        sendResponse({
          users: result.zhihuBlockedUsers as { id: string; name: string }[],
        });
      });
      return true;
    }

    if (request.action === 'factCheck') {
      // Legacy one-shot path: if a port is not attached, fall back to a single
      // sendResponse. (The content script now uses a long-lived port instead.)
      chrome.storage.sync.get(
        {
          factCheckConfigs: null,
          factCheckConfig: null,
        },
        (result) => {
          const configs = normalizeFactCheckConfigs(
            result.factCheckConfigs,
            result.factCheckConfig,
          );

          if (configs.length === 0) {
            sendResponse({ disabled: true });
            return;
          }

          callProviders(request.text ?? '', request.question, configs).then(
            (res) => {
              if (res.ok)
                sendResponse({ result: res.result, provider: res.provider });
              else sendResponse({ error: res.error });
            },
          );
        },
      );
      return true;
    }

    return;
  } catch (err) {
    logError('Error handling message', String(err));
    return;
  }
});

// Long-lived port for fact-check streaming. The content script connects with
// name 'factCheck' and sends { text } as the first message; the background
// streams stage updates (and the final result/error) back over the same port.
// A port is required because a single sendResponse can only be called once.
if (chrome.runtime.onConnect) {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'factCheck') return;

    port.onMessage.addListener((msg: unknown) => {
      if (!isFactCheckPortMessage(msg)) return;
      chrome.storage.sync.get(
        {
          factCheckConfigs: null,
          factCheckConfig: null,
        },
        (result) => {
          const configs = normalizeFactCheckConfigs(
            result.factCheckConfigs,
            result.factCheckConfig,
          );

          if (configs.length === 0) {
            port.postMessage({ disabled: true });
            return;
          }

          const controller = new AbortController();
          let portClosed = false;
          const onDisconnect = () => {
            portClosed = true;
            controller.abort();
          };
          port.onDisconnect.addListener(onDisconnect);

          const onStage = (stage: string, isRetry: boolean) => {
            try {
              port.postMessage({ stage, isRetry });
            } catch {
              /* port closed */
            }
          };
          callProviders(
            msg.text,
            msg.question,
            configs,
            onStage,
            controller.signal,
          )
            .then((res) => {
              if (portClosed) return;
              try {
                if (res.ok)
                  port.postMessage({
                    result: res.result,
                    provider: res.provider,
                  });
                else port.postMessage({ error: res.error });
              } catch {
                /* port closed */
              }
            })
            .finally(() => {
              if (port.onDisconnect.removeListener) {
                port.onDisconnect.removeListener(onDisconnect);
              }
            });
        },
      );
    });

    port.onDisconnect.addListener(() => {
      // Port closed by the content script; nothing to clean up.
    });
  });
}
