const state = {
  apiKey: localStorage.getItem('kin-gemini-key') || '',
  model: localStorage.getItem('kin-gemini-model') || 'gemini-3.6-flash',
  messages: [],
  title: 'New conversation',
  conversationId: null,
  busy: false
};

const conversationStorageKey = 'kin-conversations';

const elements = {
  sidebar: document.querySelector('#sidebar'),
  welcome: document.querySelector('#welcomeState'),
  messageList: document.querySelector('#messageList'),
  input: document.querySelector('#messageInput'),
  composer: document.querySelector('#composer'),
  conversationName: document.querySelector('#conversationName'),
  historyList: document.querySelector('#historyList'),
  apiModal: document.querySelector('#apiModal'),
  apiKeyInput: document.querySelector('#apiKeyInput'),
  modalError: document.querySelector('#modalError'),
  apiStatus: document.querySelector('#apiStatus'),
  apiStatusText: document.querySelector('#apiStatusText'),
  sendButton: document.querySelector('.send-button'),
  toast: document.querySelector('#toast'),
  modelPicker: document.querySelector('#modelPicker'),
  connectButton: document.querySelector('#connectButton')
};

function updateApiStatus() {
  const connected = Boolean(state.apiKey);
  elements.apiStatus.classList.toggle('connected', connected);
  elements.apiStatusText.textContent = connected ? 'Connected' : 'Connect API';
}

function openApiModal() {
  elements.apiKeyInput.value = state.apiKey;
  elements.modalError.textContent = '';
  elements.apiModal.hidden = false;
  window.setTimeout(() => elements.apiKeyInput.focus(), 50);
}

function closeApiModal() {
  elements.apiModal.hidden = true;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  window.setTimeout(() => elements.toast.classList.remove('show'), 2600);
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' })[character]);
}

function renderInlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1 ↗</a>');
}

function renderMarkdown(value) {
  const lines = value.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let paragraph = [];
  let list = null;
  let code = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(`<p>${paragraph.map(renderInlineMarkdown).join('<br>')}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (!list) return;
    blocks.push(`<${list.type}>${list.items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</${list.type}>`);
    list = null;
  };
  const flushBlocks = () => {
    flushParagraph();
    flushList();
  };

  lines.forEach((line) => {
    if (line.trim().startsWith('```')) {
      if (code) {
        blocks.push(`<pre><code>${escapeHtml(code.lines.join('\n'))}</code></pre>`);
        code = null;
      } else {
        flushBlocks();
        code = { lines: [] };
      }
      return;
    }
    if (code) {
      code.lines.push(line);
      return;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    const unorderedItem = line.match(/^\s*[-*]\s+(.+)$/);
    const orderedItem = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (heading) {
      flushBlocks();
      blocks.push(`<h${heading[1].length}>${renderInlineMarkdown(heading[2])}</h${heading[1].length}>`);
    } else if (unorderedItem || orderedItem) {
      const type = unorderedItem ? 'ul' : 'ol';
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push((unorderedItem || orderedItem)[1]);
    } else if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      flushBlocks();
      blocks.push('<hr>');
    } else if (line.trim()) {
      flushList();
      paragraph.push(line);
    } else {
      flushBlocks();
    }
  });
  if (code) blocks.push(`<pre><code>${escapeHtml(code.lines.join('\n'))}</code></pre>`);
  flushBlocks();
  return blocks.join('');
}

function renderMessages() {
  elements.welcome.hidden = state.messages.length > 0;
  elements.messageList.innerHTML = state.messages.map((message) => {
    const isUser = message.role === 'user';
    return `<article class="message ${isUser ? 'user' : 'assistant'}">
      <div class="message-avatar">${isUser ? 'PM' : 'M'}</div>
      <div class="message-body">
        <div class="message-meta">${isUser ? 'You' : 'Morrow'}</div>
        <div class="message-copy">${isUser ? escapeHtml(message.text).replace(/\n/g, '<br>') : renderMarkdown(message.text)}</div>
      </div>
    </article>`;
  }).join('');
  elements.chatArea?.scrollTo({ top: elements.chatArea.scrollHeight, behavior: 'smooth' });
}

function renderAssistantBubble(text = '') {
  const typing = document.createElement('article');
  typing.className = 'message assistant';
  typing.id = 'streamingMessage';
  typing.innerHTML = `<div class="message-avatar">M</div><div class="message-body"><div class="message-meta">Morrow</div><div class="message-copy">${text ? renderMarkdown(text) : '<div class="typing"><i></i><i></i><i></i></div>'}</div></div>`;
  elements.messageList.appendChild(typing);
  return typing.querySelector('.message-copy');
}

function removeStreamingBubble() {
  document.querySelector('#streamingMessage')?.remove();
}

function getConversations() {
  try {
    return JSON.parse(localStorage.getItem(conversationStorageKey) || '[]');
  } catch {
    return [];
  }
}

function saveConversation() {
  if (!state.messages.length) return;
  const conversations = getConversations().filter((conversation) => conversation.id !== state.conversationId);
  const conversation = {
    id: state.conversationId || crypto.randomUUID(),
    title: state.title,
    messages: state.messages,
    updatedAt: Date.now()
  };
  state.conversationId = conversation.id;
  localStorage.setItem(conversationStorageKey, JSON.stringify([conversation, ...conversations].slice(0, 20)));
  renderHistory();
}

function renderHistory() {
  const conversations = getConversations();
  elements.historyList.innerHTML = conversations.length
    ? conversations.map((conversation) => `<button class="history-item" data-id="${conversation.id}">${escapeHtml(conversation.title)}</button>`).join('')
    : '<div class="history-empty">Your conversations will appear here.</div>';
  elements.historyList.querySelectorAll('.history-item').forEach((item) => item.addEventListener('click', () => loadConversation(item.dataset.id)));
}

function loadConversation(id) {
  const conversation = getConversations().find((item) => item.id === id);
  if (!conversation || state.busy) return;
  state.conversationId = conversation.id;
  state.title = conversation.title;
  state.messages = conversation.messages;
  elements.conversationName.textContent = state.title;
  renderMessages();
  closeSidebar();
}

async function askGemini() {
  const prompt = elements.input.value.trim();
  if (!prompt || state.busy) return;
  if (!state.apiKey) {
    openApiModal();
    return;
  }

  state.busy = true;
  elements.sendButton.disabled = true;
  elements.input.value = '';
  elements.input.style.height = 'auto';
  if (state.messages.length === 0) {
    state.title = prompt.length > 34 ? `${prompt.slice(0, 34)}...` : prompt;
    elements.conversationName.textContent = state.title;
  }
  state.messages.push({ role: 'user', text: prompt });
  renderMessages();
  const inputMessages = [...state.messages];
  const assistantCopy = renderAssistantBubble();
  let streamedReply = '';

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/interactions?key=${encodeURIComponent(state.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: state.model,
        stream: true,
        system_instruction: 'You are Morrow, a thoughtful, clear, and warm AI companion. Give useful answers with structure when it helps. Be concise unless the user asks for depth.',
        input: inputMessages.map((message) => ({
          type: message.role === 'assistant' ? 'model_output' : 'user_input',
          content: [{ type: 'text', text: message.text }]
        }))
      })
    });
    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = 'Gemini could not answer right now.';
      try {
        const errorData = JSON.parse(errorText.replace(/^data:\s*/, '').trim());
        errorMessage = errorData.error?.message || errorMessage;
      } catch {
        errorMessage = errorText.replace(/^data:\s*/, '').trim() || errorMessage;
      }
      throw new Error(errorMessage);
    }
    if (!response.body) throw new Error('Gemini returned an empty response.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const events = buffer.split('\n');
      buffer = events.pop() || '';
      for (const line of events) {
        if (!line.startsWith('data:')) continue;
        try {
          const event = JSON.parse(line.slice(5).trim());
          if (event.delta?.type === 'text') streamedReply += event.delta.text || '';
          if (event.step?.type === 'model_output') streamedReply += (event.step.content || []).filter((content) => content.type === 'text').map((content) => content.text || '').join('');
          if (streamedReply) {
            assistantCopy.innerHTML = renderMarkdown(streamedReply);
            elements.chatArea.scrollTo({ top: elements.chatArea.scrollHeight, behavior: 'smooth' });
          }
        } catch {
          // Ignore keep-alive frames and incomplete SSE data.
        }
      }
      if (done) break;
    }
    state.messages.push({ role: 'assistant', text: streamedReply || 'I could not find a response for that.' });
  } catch (error) {
    state.messages.push({ role: 'assistant', text: `I hit a snag: ${error.message}\n\nCheck your API key and model access, then try again.` });
  } finally {
    removeStreamingBubble();
    state.busy = false;
    elements.sendButton.disabled = false;
    saveConversation();
    renderMessages();
  }
}

function newConversation() {
  if (state.messages.length) saveConversation();
  state.messages = [];
  state.title = 'New conversation';
  state.conversationId = null;
  elements.conversationName.textContent = state.title;
  renderMessages();
  elements.input.focus();
  closeSidebar();
}

function closeSidebar() { elements.sidebar.classList.remove('open'); }

elements.composer.addEventListener('submit', (event) => { event.preventDefault(); askGemini(); });
elements.input.addEventListener('input', () => {
  elements.input.style.height = 'auto';
  elements.input.style.height = `${Math.min(elements.input.scrollHeight, 130)}px`;
});
elements.input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); askGemini(); }
});
document.querySelectorAll('.prompt-card').forEach((card) => card.addEventListener('click', () => {
  elements.input.value = card.dataset.prompt;
  elements.input.focus();
  elements.input.dispatchEvent(new Event('input'));
}));
document.querySelector('#apiStatus').addEventListener('click', openApiModal);
document.querySelector('#settingsButton').addEventListener('click', openApiModal);
document.querySelector('#modalClose').addEventListener('click', closeApiModal);
elements.connectButton.addEventListener('click', async () => {
  const key = elements.apiKeyInput.value.trim();
  if (!key) { elements.modalError.textContent = 'Paste a Gemini API key to connect.'; return; }
  elements.connectButton.disabled = true;
  elements.connectButton.firstChild.textContent = 'Checking key...';
  elements.modalError.textContent = '';
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${state.model}?key=${encodeURIComponent(key)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'This API key is not valid.');
    state.apiKey = key;
    localStorage.setItem('kin-gemini-key', key);
    updateApiStatus();
    closeApiModal();
    showToast('Gemini is connected for this browser.');
  } catch (error) {
    elements.modalError.textContent = error.message.includes('API key') || error.message.includes('key')
      ? 'This API key is invalid or does not have access to the selected model.'
      : error.message;
  } finally {
    elements.connectButton.disabled = false;
    elements.connectButton.firstChild.textContent = 'Save and connect ';
  }
});
document.querySelector('#toggleKey').addEventListener('click', (event) => {
  const visible = elements.apiKeyInput.type === 'text';
  elements.apiKeyInput.type = visible ? 'password' : 'text';
  event.currentTarget.textContent = visible ? 'Show' : 'Hide';
});
document.querySelector('#newChatButton').addEventListener('click', newConversation);
document.querySelector('#menuButton').addEventListener('click', () => elements.sidebar.classList.add('open'));
document.querySelector('#sidebarClose').addEventListener('click', closeSidebar);
document.querySelector('#attachButton').addEventListener('click', () => showToast('File attachments are ready for a future pass.'));
document.querySelector('#savedButton').addEventListener('click', () => showToast('Saved thoughts are ready for a future pass.'));
elements.apiModal.addEventListener('click', (event) => { if (event.target === elements.apiModal) closeApiModal(); });
elements.modelPicker.value = state.model;
elements.modelPicker.addEventListener('change', (event) => {
  state.model = event.target.value;
  localStorage.setItem('kin-gemini-model', state.model);
  showToast(`${event.target.selectedOptions[0].text} selected.`);
});

elements.chatArea = document.querySelector('#chatArea');
updateApiStatus();
renderHistory();
