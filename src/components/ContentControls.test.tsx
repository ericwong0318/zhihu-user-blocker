import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentControls } from './ContentControls';
import { mockChromeStorage } from '../test/setup';

type BlockedUser = { id: string; name: string };
type BlockedUsersResult = { zhihuBlockedUsers: BlockedUser[] };

// Minimal chrome mock shape used by these tests.
type ChromeMock = {
  storage: typeof mockChromeStorage;
  runtime: { sendMessage: ReturnType<typeof vi.fn> };
};

// Build a minimal fake Zhihu DOM. The content script's getZhihuUsers() only
// matches .UserLink-link inside an .AuthorInfo-head (or data-za-detail-view-path)
// ancestor, so we mirror that structure here.
function seedZhihuDom() {
  document.body.innerHTML = '';
  const listItem = document.createElement('div');
  listItem.className = 'List-item';
  const authorInfo = document.createElement('div');
  authorInfo.className = 'AuthorInfo-head';
  const link = document.createElement('a');
  link.className = 'UserLink-link';
  link.setAttribute('href', '/people/alice');
  link.textContent = 'Alice';
  authorInfo.appendChild(link);
  listItem.appendChild(authorInfo);
  document.body.appendChild(listItem);
  return { listItem, link };
}

// Seed a Zhihu answer body so getZhihuContent() picks it up. The content block
// must have enough text (>20 chars) to be collected. We also include an author
// link so the Block controls are rendered, letting us assert the Fact Check
// button is placed next to the Block button.
function seedAnswerDom() {
  document.body.innerHTML = '';
  const listItem = document.createElement('div');
  listItem.className = 'List-item ContentItem';
  const authorInfo = document.createElement('div');
  authorInfo.className = 'AuthorInfo-head';
  const link = document.createElement('a');
  link.className = 'UserLink-link';
  link.setAttribute('href', '/people/alice');
  link.textContent = 'Alice';
  authorInfo.appendChild(link);
  listItem.appendChild(authorInfo);
  const rich = document.createElement('div');
  rich.className = 'RichText';
  const p = document.createElement('p');
  p.textContent =
    'All politicians are corrupt and 90% of people agree with this claim without question.';
  rich.appendChild(p);
  listItem.appendChild(rich);
  document.body.appendChild(listItem);
  return { listItem, link, rich, p };
}

beforeEach(() => {
  (global as unknown as { chrome: ChromeMock }).chrome = {
    storage: mockChromeStorage,
    runtime: { sendMessage: vi.fn() },
  };
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('Blocker (unit)', () => {
  it('renders a Block button next to the detected user name', async () => {
    seedZhihuDom();
    render(<ContentControls />);
    // The inline control is portaled right after the user link.
    const link = document.querySelector('.UserLink-link') as HTMLElement;
    await waitFor(() => {
      const next = link.nextElementSibling as HTMLElement | null;
      expect(next?.querySelector('button')?.textContent).toBe('Block');
    });
  });

  it('blocks a user: hides content and persists to storage', async () => {
    const { listItem, link } = seedZhihuDom();
    render(<ContentControls />);
    const blockBtn = await waitFor(() => {
      const next = link.nextElementSibling as HTMLElement;
      return next.querySelector('button') as HTMLButtonElement;
    });
    fireEvent.click(blockBtn);

    await waitFor(() => {
      expect(listItem.style.display).toBe('none');
    });
    const stored = (await mockChromeStorage.sync.get({
      zhihuBlockedUsers: [],
    })) as BlockedUsersResult;
    expect(stored.zhihuBlockedUsers).toHaveLength(1);
    expect(stored.zhihuBlockedUsers[0].id).toBe('/people/alice');
  });

  it('unblock removes the user from storage and shows content', async () => {
    const { listItem, link } = seedZhihuDom();
    render(<ContentControls />);
    const blockBtn = await waitFor(
      () =>
        (link.nextElementSibling as HTMLElement).querySelector(
          'button',
        ) as HTMLButtonElement,
    );
    fireEvent.click(blockBtn);

    const unblockBtn = await waitFor(() => {
      const buttons = (link.nextElementSibling as HTMLElement).querySelectorAll(
        'button',
      );
      return buttons[buttons.length - 1] as HTMLButtonElement; // "Unblock"
    });
    expect(unblockBtn.textContent).toBe('Unblock');
    fireEvent.click(unblockBtn);

    await waitFor(() => expect(listItem.style.display).toBe(''));
    const stored = (await mockChromeStorage.sync.get({
      zhihuBlockedUsers: [],
    })) as BlockedUsersResult;
    expect(stored.zhihuBlockedUsers).toHaveLength(0);
  });

  it('injects a Fact Check button next to the Block button', async () => {
    // Set up storage with factCheckEnabled: true and providers configured
    await mockChromeStorage.sync.set({
      factCheckConfigs: [
        {
          provider: 'openai',
          apiKey: 'test-key',
          model: 'gpt-4o-mini',
          language: 'en',
        },
      ],
      factCheckConfig: null,
      factCheckEnabled: true,
      factCheckTimeoutSec: 9,
    });

    const { listItem, link, rich } = seedAnswerDom();
    render(<ContentControls />);
    const factCheckBtn = await waitFor(() => {
      const btn = screen.getByText('Fact Check');
      expect(btn).toBeInTheDocument();
      return btn;
    });
    // The button is portaled into a container next to the Block button.
    const container = document.querySelector('.zhihu-factcheck-inline');
    expect(container).not.toBeNull();
    expect(container?.contains(factCheckBtn)).toBe(true);

    // The fact-check container must sit right next to the Block controls
    // container (the inline block container), never at the first sentence of
    // the answer body.
    const blockContainer = document.querySelector('.zhihu-block-inline');
    expect(blockContainer).not.toBeNull();
    expect(blockContainer?.nextElementSibling).toBe(container);
    // It must NOT be inside the answer body (rich text / <p>).
    expect(rich.contains(container)).toBe(false);
    expect(listItem.contains(container)).toBe(true);
    // The Block button is also present next to the author link.
    expect(link.nextElementSibling).toBe(blockContainer);
  });

  it('re-enables Fact Check when provider config is added via storage change', async () => {
    seedAnswerDom();

    // Initially: factCheckEnabled true but no providers
    await mockChromeStorage.sync.set({
      factCheckConfigs: null,
      factCheckConfig: null,
      factCheckEnabled: true,
      factCheckTimeoutSec: 9,
    });

    render(<ContentControls />);

    const factCheckBtn = (await waitFor(() =>
      screen.getByText('Fact Check'),
    )) as HTMLButtonElement;
    expect(factCheckBtn).toBeDisabled();

    const newConfig = [
      {
        provider: 'openai',
        apiKey: 'abc',
        model: 'gpt-4o-mini',
        language: 'en',
      },
    ];
    await mockChromeStorage.sync.set({ factCheckConfigs: newConfig });
    act(() => {
      mockChromeStorage.triggerOnChanged({
        factCheckConfigs: { oldValue: null, newValue: newConfig },
      });
    });

    await waitFor(() => expect(screen.getByText('Fact Check')).toBeEnabled());
  });

  it('renders exactly one Fact Check button for a collapsed answer with multiple matching content selectors', async () => {
    // A collapsed Zhihu answer often matches several CONTENT_SELECTORS
    // (.ContentItem-title, .RichText, .AnswerCard) that all belong to the same
    // answer. We must not create one button per match.
    
    // Set up storage with factCheckEnabled: true and providers configured
    await mockChromeStorage.sync.set({
      factCheckConfigs: [
        {
          provider: 'openai',
          apiKey: 'test-key',
          model: 'gpt-4o-mini',
          language: 'en',
        },
      ],
      factCheckConfig: null,
      factCheckEnabled: true,
      factCheckTimeoutSec: 9,
    });

    document.body.innerHTML = '';
    const listItem = document.createElement('div');
    listItem.className = 'List-item ContentItem';
    const authorInfo = document.createElement('div');
    authorInfo.className = 'AuthorInfo-head';
    const link = document.createElement('a');
    link.className = 'UserLink-link';
    link.setAttribute('href', '/people/alice');
    link.textContent = 'Alice';
    authorInfo.appendChild(link);
    listItem.appendChild(authorInfo);

    const title = document.createElement('h2');
    title.className = 'ContentItem-title';
    title.textContent =
      'Why are politicians corrupt and what should we do about it?';
    listItem.appendChild(title);

    const answerCard = document.createElement('div');
    answerCard.className = 'AnswerCard';
    const rich = document.createElement('div');
    rich.className = 'RichText';
    const p = document.createElement('p');
    p.textContent =
      'All politicians are corrupt and 90% of people agree with this claim without question.';
    rich.appendChild(p);
    answerCard.appendChild(rich);
    listItem.appendChild(answerCard);
    document.body.appendChild(listItem);

    render(<ContentControls />);

    // Exactly one Fact Check button, even though 3 selectors matched.
    await waitFor(() => {
      expect(screen.getAllByText('Fact Check')).toHaveLength(1);
    });
    // Allow up to 2 containers in this edge case (e.g., one per content
    // selector group), but never more than 1 Fact Check button.
    const containers = document.querySelectorAll('.zhihu-factcheck-inline');
    expect(containers.length).toBeGreaterThanOrEqual(1);
    expect(containers.length).toBeLessThanOrEqual(2);
  });
});