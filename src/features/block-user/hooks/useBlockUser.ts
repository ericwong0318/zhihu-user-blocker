import { useEffect, useRef, useState } from 'react';

// Types
export interface BlockedUser { id: string; name: string }
export interface ZhihuUser { name: string; id: string; element: HTMLElement }

// Constants
export const INLINE_CLASS = 'zhihu-block-inline';

// DOM helpers
export const getZhihuUsers = (): ZhihuUser[] => {
  try {
    const nodes = Array.from(
      document.querySelectorAll(
        '[data-za-detail-view-path^="User"] a.UserLink-link, .AuthorInfo-head a.UserLink-link'
      )
    );
    const users: ZhihuUser[] = [];
    nodes.forEach((el) => {
      const name = el.textContent?.trim() || '未知用户';
      const id = el.getAttribute('href') || name;
      users.push({ name, id, element: el as HTMLElement });
    });
    return Array.from(new Map(users.map((u) => [u.id, u])).values());
  } catch (err) {
    console.error('Failed to collect Zhihu users', err);
    return [];
  }
};

export const setUserContentHidden = (user: ZhihuUser, hidden: boolean) => {
  let node: HTMLElement | null = user.element;
  while (node && node !== document.body) {
    if (
      node.classList.contains('List-item') ||
      node.classList.contains('ContentItem') ||
      node.classList.contains('CommentItem')
    ) {
      node.style.display = hidden ? 'none' : '';
      break;
    }
    node = node.parentElement;
  }
};

export const useBlockUser = () => {
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [users, setUsers] = useState<ZhihuUser[]>([]);
  const [blockContainers, setBlockContainers] = useState<Map<string, HTMLElement>>(new Map());
  const scanTimer = useRef<number | undefined>(undefined);

  // Load storage on mount
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    const load = () => {
      chrome.storage.sync.get({ zhihuBlockedUsers: [] }, (r) => {
        if (r.zhihuBlockedUsers) setBlocked(r.zhihuBlockedUsers as BlockedUser[]);
      });
    };
    load();
    const listener = (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, area: string) => {
      if (area !== 'sync') return;
      if (changes.zhihuBlockedUsers) setBlocked(changes.zhihuBlockedUsers.newValue as BlockedUser[]);
    };
    if (chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    }
  }, []);

  // Scan DOM for users
  useEffect(() => {
    const scan = () => {
      setUsers((prev) => {
        const map = new Map(prev.map((u) => [u.id, u]));
        getZhihuUsers().forEach((u) => map.set(u.id, u));
        return Array.from(map.values());
      });
    };
    scan();
    const observer = new MutationObserver(() => {
      if (scanTimer.current) window.clearTimeout(scanTimer.current);
      scanTimer.current = window.setTimeout(scan, 200);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (scanTimer.current) window.clearTimeout(scanTimer.current);
    };
  }, []);

  // Container injection for block buttons
  useEffect(() => {
    const next = new Map<string, HTMLElement>();
    users.forEach((user) => {
      const parent = user.element.parentElement;
      if (!parent) return;
      const escapedId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(user.id) : user.id;
      const existing = parent.querySelector<HTMLElement>(`.${INLINE_CLASS}[data-userid="${escapedId}"]`);
      if (existing) { next.set(user.id, existing); return; }
      const span = document.createElement('span');
      span.className = INLINE_CLASS;
      span.setAttribute('data-userid', user.id);
      user.element.insertAdjacentElement('afterend', span);
      next.set(user.id, span);
    });
    setBlockContainers(next);
  }, [users]);

  // Hide content for blocked users when blocked list changes
  useEffect(() => {
    blocked.forEach((blockedUser) => {
      const user = users.find((u) => u.id === blockedUser.id);
      if (user) {
        setUserContentHidden(user, true);
      }
    });
  }, [blocked, users]);

  const blockUser = (id: string, name: string) => {
    if (blocked.some((u) => u.id === id)) return;
    const updated = [...blocked, { id, name }];
    setBlocked(updated);
    users.filter((u) => u.id === id).forEach((u) => setUserContentHidden(u, true));
    chrome.storage?.sync?.set({ zhihuBlockedUsers: updated });
  };

  const unblockUser = (id: string) => {
    const updated = blocked.filter((u) => u.id !== id);
    setBlocked(updated);
    const user = users.find((u) => u.id === id);
    if (user) setUserContentHidden(user, false);
    chrome.storage?.sync?.set({ zhihuBlockedUsers: updated });
  };

  return { blocked, users, blockContainers, blockUser, unblockUser };
};
