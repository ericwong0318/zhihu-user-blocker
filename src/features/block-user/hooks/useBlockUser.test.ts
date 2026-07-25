import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useBlockUser, getZhihuUsers, setUserContentHidden, INLINE_CLASS, type BlockedUser, type ZhihuUser } from './useBlockUser';

describe('useBlockUser', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    
    // Mock chrome.storage with callback-based API
    global.chrome = {
      storage: {
        sync: {
          get: vi.fn(),
          set: vi.fn(),
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
    } as unknown as typeof global.chrome;

    // Mock CSS.escape
    if (typeof CSS !== 'undefined' && CSS.escape) {
      vi.spyOn(CSS, 'escape').mockImplementation((str: string) => str);
    }
    
    // Clear DOM
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  describe('useBlockUser hook', () => {
    it('should initialize with empty blocked users list', async () => {
      global.chrome.storage.sync.get.mockImplementation((_defaults: unknown, callback: (items: { zhihuBlockedUsers: BlockedUser[] }) => void) => {
        callback({ zhihuBlockedUsers: [] });
      });
      global.chrome.storage.onChanged.addListener.mockImplementation(() => {});

      const { result } = renderHook(() => useBlockUser());
      
      await waitFor(() => {
        expect(result.current.blocked).toEqual([]);
      });
    });

    it('should load blocked users from storage on mount', async () => {
      const mockBlockedUsers: BlockedUser[] = [
        { id: 'user1', name: 'User One' },
        { id: 'user2', name: 'User Two' }
      ];
      
      global.chrome.storage.sync.get.mockImplementation((_defaults: unknown, callback: (items: { zhihuBlockedUsers: BlockedUser[] }) => void) => {
        callback({ zhihuBlockedUsers: mockBlockedUsers });
      });
      global.chrome.storage.onChanged.addListener.mockImplementation(() => {});

      const { result } = renderHook(() => useBlockUser());
      
      await waitFor(() => {
        expect(result.current.blocked).toEqual(mockBlockedUsers);
      });
    });

    it('should listen for storage changes', async () => {
      global.chrome.storage.sync.get.mockImplementation((_defaults: unknown, callback: (items: { zhihuBlockedUsers: BlockedUser[] }) => void) => {
        callback({ zhihuBlockedUsers: [] });
      });
      
      let changeListener: (changes: Record<string, { oldValue: unknown; newValue: unknown }>, area: string) => void;
      global.chrome.storage.onChanged.addListener.mockImplementation((listener) => {
        changeListener = listener;
      });

      const { result } = renderHook(() => useBlockUser());
      
      // Wait for the hook to mount and register the listener
      await waitFor(() => {
        expect(global.chrome.storage.onChanged.addListener).toHaveBeenCalled();
      });
      
      // Verify initial state
      expect(result.current.blocked).toEqual([]);

      // Simulate storage change - call the listener directly
      const newBlockedUsers: BlockedUser[] = [{ id: 'newuser', name: 'New User' }];
      if (changeListener) {
        act(() => {
          changeListener({ zhihuBlockedUsers: { oldValue: [], newValue: newBlockedUsers } }, 'sync');
        });
      }

      // Wait for state to update (the listener calls setBlocked which is async)
      await waitFor(() => {
        expect(result.current.blocked).toEqual(newBlockedUsers);
      });
    });

    it('should block a user and update storage', async () => {
      global.chrome.storage.sync.get.mockImplementation((_defaults: unknown, callback: (items: { zhihuBlockedUsers: BlockedUser[] }) => void) => {
        callback({ zhihuBlockedUsers: [] });
      });
      // The actual implementation doesn't pass a callback to set
      global.chrome.storage.sync.set.mockImplementation((_data: unknown) => {});
      global.chrome.storage.onChanged.addListener.mockImplementation(() => {});

      const { result } = renderHook(() => useBlockUser());
      
      await waitFor(() => {
        expect(result.current.blocked).toEqual([]);
      });

      act(() => {
        result.current.blockUser('newuser', 'New User');
      });

      // The actual implementation doesn't use a callback
      expect(global.chrome.storage.sync.set).toHaveBeenCalledWith(
        { zhihuBlockedUsers: [{ id: 'newuser', name: 'New User' }] }
      );
      
      await waitFor(() => {
        expect(result.current.blocked).toEqual([{ id: 'newuser', name: 'New User' }]);
      });
    });

    it('should not add duplicate user', async () => {
      global.chrome.storage.sync.get.mockImplementation((_defaults: unknown, callback: (items: { zhihuBlockedUsers: BlockedUser[] }) => void) => {
        callback({ zhihuBlockedUsers: [{ id: 'existing', name: 'Existing User' }] });
      });
      global.chrome.storage.sync.set.mockImplementation((_data: unknown) => {});
      global.chrome.storage.onChanged.addListener.mockImplementation(() => {});

      const { result } = renderHook(() => useBlockUser());
      
      await waitFor(() => {
        expect(result.current.blocked).toEqual([{ id: 'existing', name: 'Existing User' }]);
      });

      act(() => {
        result.current.blockUser('existing', 'Existing User');
      });

      // set should not be called for duplicate
      expect(global.chrome.storage.sync.set).not.toHaveBeenCalled();
    });

    it('should unblock a user and update storage', async () => {
      const initialBlocked: BlockedUser[] = [
        { id: 'user1', name: 'User One' },
        { id: 'user2', name: 'User Two' }
      ];
      
      global.chrome.storage.sync.get.mockImplementation((_defaults: unknown, callback: (items: { zhihuBlockedUsers: BlockedUser[] }) => void) => {
        callback({ zhihuBlockedUsers: initialBlocked });
      });
      global.chrome.storage.sync.set.mockImplementation((_data: unknown) => {});
      global.chrome.storage.onChanged.addListener.mockImplementation(() => {});

      const { result } = renderHook(() => useBlockUser());
      
      await waitFor(() => {
        expect(result.current.blocked).toEqual(initialBlocked);
      });

      act(() => {
        result.current.unblockUser('user1');
      });

      expect(global.chrome.storage.sync.set).toHaveBeenCalledWith(
        { zhihuBlockedUsers: [{ id: 'user2', name: 'User Two' }] }
      );
      
      await waitFor(() => {
        expect(result.current.blocked).toEqual([{ id: 'user2', name: 'User Two' }]);
      });
    });

    it('should scan for Zhihu users on page', async () => {
      global.chrome.storage.sync.get.mockImplementation((_defaults: unknown, callback: (items: { zhihuBlockedUsers: BlockedUser[] }) => void) => {
        callback({ zhihuBlockedUsers: [] });
      });
      global.chrome.storage.onChanged.addListener.mockImplementation(() => {});

      const { result } = renderHook(() => useBlockUser());
      
      await waitFor(() => {
        expect(result.current.blocked).toEqual([]);
      });

      // Mock DOM elements for Zhihu users using CORRECT selectors
      // Selector: '[data-za-detail-view-path^="User"] a.UserLink-link, .AuthorInfo-head a.UserLink-link'
      // The data-za-detail-view-path must be on a PARENT of the <a> element
      const parent = document.createElement('div');
      parent.setAttribute('data-za-detail-view-path', 'UserProfile');
      
      const mockAuthorLink = document.createElement('a');
      mockAuthorLink.className = 'UserLink-link';
      mockAuthorLink.href = 'https://www.zhihu.com/people/targetuser';
      mockAuthorLink.textContent = 'Target User';
      
      parent.appendChild(mockAuthorLink);
      
      const mockContent = document.createElement('div');
      mockContent.className = 'ContentItem';
      mockContent.appendChild(parent);
      document.body.appendChild(mockContent);

      // Wait for scan effect to run
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 300));
      });

      expect(result.current.users.length).toBeGreaterThan(0);
      const foundUser = result.current.users.find(u => u.name === 'Target User');
      expect(foundUser).toBeDefined();
      expect(foundUser?.id).toBe('https://www.zhihu.com/people/targetuser');

      document.body.removeChild(mockContent);
    });

    it('should create block containers for users', async () => {
      global.chrome.storage.sync.get.mockImplementation((_defaults: unknown, callback: (items: { zhihuBlockedUsers: BlockedUser[] }) => void) => {
        callback({ zhihuBlockedUsers: [] });
      });
      global.chrome.storage.onChanged.addListener.mockImplementation(() => {});

      const { result } = renderHook(() => useBlockUser());
      
      await waitFor(() => {
        expect(result.current.blocked).toEqual([]);
      });

      // Mock DOM elements for Zhihu users
      const parent = document.createElement('div');
      parent.setAttribute('data-za-detail-view-path', 'UserProfile');
      
      const mockAuthorLink = document.createElement('a');
      mockAuthorLink.className = 'UserLink-link';
      mockAuthorLink.href = 'https://www.zhihu.com/people/targetuser';
      mockAuthorLink.textContent = 'Target User';
      
      parent.appendChild(mockAuthorLink);
      
      const mockContent = document.createElement('div');
      mockContent.className = 'ContentItem';
      mockContent.appendChild(parent);
      document.body.appendChild(mockContent);

      // Wait for scan effect and container injection
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 300));
      });

      expect(result.current.blockContainers.size).toBeGreaterThan(0);
      const container = result.current.blockContainers.get('https://www.zhihu.com/people/targetuser');
      expect(container).toBeDefined();
      expect(container?.className).toBe(INLINE_CLASS);
      expect(container?.getAttribute('data-userid')).toBe('https://www.zhihu.com/people/targetuser');

      document.body.removeChild(mockContent);
    });

    it('should hide content for blocked users loaded from storage', async () => {
      const mockBlockedUsers: BlockedUser[] = [
        { id: 'https://www.zhihu.com/people/blockeduser', name: 'Blocked User' },
      ];
      
      global.chrome.storage.sync.get.mockImplementation((_defaults: unknown, callback: (items: { zhihuBlockedUsers: BlockedUser[] }) => void) => {
        callback({ zhihuBlockedUsers: mockBlockedUsers });
      });
      global.chrome.storage.onChanged.addListener.mockImplementation(() => {});

      const { result } = renderHook(() => useBlockUser());
      
      await waitFor(() => {
        expect(result.current.blocked).toEqual(mockBlockedUsers);
      });

      // Set up DOM with the blocked user's content
      const parent = document.createElement('div');
      parent.setAttribute('data-za-detail-view-path', 'UserProfile');
      
      const mockAuthorLink = document.createElement('a');
      mockAuthorLink.className = 'UserLink-link';
      mockAuthorLink.href = 'https://www.zhihu.com/people/blockeduser';
      mockAuthorLink.textContent = 'Blocked User';
      
      parent.appendChild(mockAuthorLink);
      
      const mockContent = document.createElement('div');
      mockContent.className = 'ContentItem';
      mockContent.appendChild(parent);
      document.body.appendChild(mockContent);

      // Wait for scan effect and the hide-content effect to run
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 300));
      });

      // The blocked user's content should be hidden
      expect(mockContent.style.display).toBe('none');

      document.body.removeChild(mockContent);
    });
  });

  describe('getZhihuUsers', () => {
    it('should extract Zhihu users from DOM using correct selectors', () => {
      const parent1 = document.createElement('div');
      parent1.setAttribute('data-za-detail-view-path', 'UserProfile');
      
      const authorLink1 = document.createElement('a');
      authorLink1.className = 'UserLink-link';
      authorLink1.href = 'https://www.zhihu.com/people/user1';
      authorLink1.textContent = 'User One';
      
      parent1.appendChild(authorLink1);
      document.body.appendChild(parent1);

      const parent2 = document.createElement('div');
      parent2.setAttribute('data-za-detail-view-path', 'UserAnswer');
      
      const authorLink2 = document.createElement('a');
      authorLink2.className = 'UserLink-link';
      authorLink2.href = 'https://www.zhihu.com/people/user2';
      authorLink2.textContent = 'User Two';
      
      parent2.appendChild(authorLink2);
      document.body.appendChild(parent2);

      const users = getZhihuUsers();
      
      expect(users).toHaveLength(2);
      expect(users.map(u => u.name).sort()).toEqual(['User One', 'User Two']);
      expect(users.map(u => u.id).sort()).toEqual([
        'https://www.zhihu.com/people/user1',
        'https://www.zhihu.com/people/user2'
      ]);

      document.body.removeChild(parent1);
      document.body.removeChild(parent2);
    });

    it('should deduplicate users by id (keeps last occurrence due to Map.set)', () => {
      const parent1 = document.createElement('div');
      parent1.setAttribute('data-za-detail-view-path', 'UserProfile');
      
      const authorLink1 = document.createElement('a');
      authorLink1.className = 'UserLink-link';
      authorLink1.href = 'https://www.zhihu.com/people/user1';
      authorLink1.textContent = 'User One';
      
      parent1.appendChild(authorLink1);
      document.body.appendChild(parent1);

      const parent2 = document.createElement('div');
      parent2.setAttribute('data-za-detail-view-path', 'UserProfile');
      
      const authorLink2 = document.createElement('a');
      authorLink2.className = 'UserLink-link';
      authorLink2.href = 'https://www.zhihu.com/people/user1'; // Same ID
      authorLink2.textContent = 'User One Duplicate';
      
      parent2.appendChild(authorLink2);
      document.body.appendChild(parent2);

      const users = getZhihuUsers();
      
      expect(users).toHaveLength(1);
      // The Map keeps the last value for a key, so it keeps the LAST occurrence
      expect(users[0].name).toBe('User One Duplicate');

      document.body.removeChild(parent1);
      document.body.removeChild(parent2);
    });

    it('should return empty array when no users found', () => {
      const users = getZhihuUsers();
      expect(users).toEqual([]);
    });

    it('should handle missing attributes gracefully', () => {
      const parent = document.createElement('div');
      parent.setAttribute('data-za-detail-view-path', 'UserProfile');
      
      const authorLink = document.createElement('a');
      authorLink.className = 'UserLink-link';
      // No href, no textContent
      authorLink.textContent = '';
      
      parent.appendChild(authorLink);
      document.body.appendChild(parent);

      const users = getZhihuUsers();
      
      expect(users).toHaveLength(1);
      expect(users[0].name).toBe('未知用户');
      expect(users[0].id).toBe('未知用户');

      document.body.removeChild(parent);
    });

    it('should match AuthorInfo-head selector', () => {
      const parent = document.createElement('div');
      parent.className = 'AuthorInfo-head';
      
      const authorLink = document.createElement('a');
      authorLink.className = 'UserLink-link';
      // No data-za-detail-view-path but inside .AuthorInfo-head
      authorLink.href = 'https://www.zhihu.com/people/authorinfo';
      authorLink.textContent = 'Author Info User';
      
      parent.appendChild(authorLink);
      document.body.appendChild(parent);

      const users = getZhihuUsers();
      
      expect(users).toHaveLength(1);
      expect(users[0].name).toBe('Author Info User');

      document.body.removeChild(parent);
    });
  });

  describe('setUserContentHidden', () => {
    it('should hide content by finding parent ContentItem container', () => {
      const container = document.createElement('div');
      container.className = 'ContentItem';
      
      const authorLink = document.createElement('a');
      authorLink.className = 'UserLink-link';
      authorLink.href = 'https://www.zhihu.com/people/user1';
      authorLink.textContent = 'User One';
      
      container.appendChild(authorLink);
      document.body.appendChild(container);

      const user: ZhihuUser = { 
        name: 'User One', 
        id: 'https://www.zhihu.com/people/user1', 
        element: authorLink 
      };
      
      setUserContentHidden(user, true);
      expect(container.style.display).toBe('none');

      setUserContentHidden(user, false);
      expect(container.style.display).toBe('');

      document.body.removeChild(container);
    });

    it('should handle List-item container', () => {
      const container = document.createElement('div');
      container.className = 'List-item';
      
      const authorLink = document.createElement('a');
      authorLink.className = 'UserLink-link';
      authorLink.href = 'https://www.zhihu.com/people/user1';
      authorLink.textContent = 'User One';
      
      container.appendChild(authorLink);
      document.body.appendChild(container);

      const user: ZhihuUser = { 
        name: 'User One', 
        id: 'https://www.zhihu.com/people/user1', 
        element: authorLink 
      };
      
      setUserContentHidden(user, true);
      expect(container.style.display).toBe('none');

      document.body.removeChild(container);
    });

    it('should handle CommentItem container', () => {
      const container = document.createElement('div');
      container.className = 'CommentItem';
      
      const authorLink = document.createElement('a');
      authorLink.className = 'UserLink-link';
      authorLink.href = 'https://www.zhihu.com/people/user1';
      authorLink.textContent = 'User One';
      
      container.appendChild(authorLink);
      document.body.appendChild(container);

      const user: ZhihuUser = { 
        name: 'User One', 
        id: 'https://www.zhihu.com/people/user1', 
        element: authorLink 
      };
      
      setUserContentHidden(user, true);
      expect(container.style.display).toBe('none');

      document.body.removeChild(container);
    });

    it('should do nothing if no matching parent found', () => {
      const authorLink = document.createElement('a');
      authorLink.className = 'UserLink-link';
      authorLink.href = 'https://www.zhihu.com/people/user1';
      authorLink.textContent = 'User One';
      
      document.body.appendChild(authorLink);

      const user: ZhihuUser = { 
        name: 'User One', 
        id: 'https://www.zhihu.com/people/user1', 
        element: authorLink 
      };
      
      // Should not throw
      expect(() => setUserContentHidden(user, true)).not.toThrow();
      expect(() => setUserContentHidden(user, false)).not.toThrow();

      document.body.removeChild(authorLink);
    });
  });

  describe('INLINE_CLASS constant', () => {
    it('should have correct class name', () => {
      expect(INLINE_CLASS).toBe('zhihu-block-inline');
    });
  });
});
