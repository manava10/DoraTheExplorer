import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const KEY_STORAGE = 'kin-gemini-key';
const MODEL_STORAGE = 'kin-gemini-model';
const CONVERSATIONS_STORAGE = 'kin-conversations';
const DEFAULT_MODEL = 'gemini-3.6-flash';
const models = [
  ['gemini-3.8-flash', 'Gemini 3.8 Flash'],
  ['gemini-3.7-flash', 'Gemini 3.7 Flash'],
  ['gemini-3.6-flash', 'Gemini 3.6 Flash'],
  ['gemini-3.5-flash', 'Gemini 3.5 Flash'],
  ['gemini-2.5-pro', 'Gemini 2.5 Pro']
];

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

function renderTableRow(line, tagName) {
  const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
  return `<tr>${cells.map((cell) => `<${tagName}>${renderInlineMarkdown(cell.trim())}</${tagName}>`).join('')}</tr>`;
}

function renderMarkdown(value) {
  const lines = value.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let paragraph = [];
  let list = null;
  let code = null;
  const flushParagraph = () => { if (paragraph.length) { blocks.push(`<p>${paragraph.map(renderInlineMarkdown).join('<br>')}</p>`); paragraph = []; } };
  const flushList = () => { if (list) { blocks.push(`<${list.type}>${list.items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</${list.type}>`); list = null; } };
  const flush = () => { flushParagraph(); flushList(); };
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line.trim().startsWith('```')) { if (code) { blocks.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`); code = null; } else { flush(); code = []; } index += 1; continue; }
    if (code) { code.push(line); index += 1; continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    const tableSeparator = lines[index + 1]?.match(/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/);
    if (line.includes('|') && tableSeparator) {
      flush();
      const rows = [`<table><thead>${renderTableRow(line, 'th')}</thead><tbody>`];
      index += 2;
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) { rows.push(renderTableRow(lines[index], 'td')); index += 1; }
      rows.push('</tbody></table>');
      blocks.push(rows.join(''));
      continue;
    }
    if (line.trim().startsWith('>')) {
      flush();
      const quoteLines = [];
      while (index < lines.length && lines[index].trim().startsWith('>')) { quoteLines.push(lines[index].replace(/^\s*>\s?/, '')); index += 1; }
      blocks.push(`<blockquote>${renderMarkdown(quoteLines.join('\n'))}</blockquote>`);
      continue;
    }
    if (heading) { flush(); blocks.push(`<h${heading[1].length}>${renderInlineMarkdown(heading[2])}</h${heading[1].length}>`); }
    else if (unordered || ordered) { const type = unordered ? 'ul' : 'ol'; if (!list || list.type !== type) { flushList(); list = { type, items: [] }; } list.items.push((unordered || ordered)[1]); }
    else if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) { flush(); blocks.push('<hr>'); }
    else if (line.trim()) { flushList(); paragraph.push(line); }
    else flush();
    index += 1;
  }
  if (code) blocks.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
  flush();
  return blocks.join('');
}

function readConversations() {
  try { return JSON.parse(localStorage.getItem(CONVERSATIONS_STORAGE) || '[]'); } catch { return []; }
}

function App() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(KEY_STORAGE) || '');
  const [model, setModel] = useState(() => localStorage.getItem(MODEL_STORAGE) || DEFAULT_MODEL);
  const [messages, setMessages] = useState([]);
  const [title, setTitle] = useState('New conversation');
  const [conversationId, setConversationId] = useState(null);
  const [conversations, setConversations] = useState(readConversations);
  const [busy, setBusy] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [apiModalOpen, setApiModalOpen] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [keyError, setKeyError] = useState('');
  const [checkingKey, setCheckingKey] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => { document.title = 'Dora the Explorer | Your thinking companion'; }, []);
  useEffect(() => { if (!toast) return undefined; const timer = setTimeout(() => setToast(''), 2600); return () => clearTimeout(timer); }, [toast]);

  const persistConversation = (nextMessages, nextTitle = title, nextId = conversationId) => {
    if (!nextMessages.length) return;
    const saved = { id: nextId || crypto.randomUUID(), title: nextTitle, messages: nextMessages, updatedAt: Date.now() };
    const nextConversations = [saved, ...readConversations().filter((item) => item.id !== saved.id)].slice(0, 20);
    localStorage.setItem(CONVERSATIONS_STORAGE, JSON.stringify(nextConversations));
    setConversations(nextConversations);
    setConversationId(saved.id);
  };

  const openApiModal = () => { setKeyInput(apiKey); setKeyError(''); setApiModalOpen(true); };
  const startNewConversation = () => { persistConversation(messages); setMessages([]); setTitle('New conversation'); setConversationId(null); setSidebarOpen(false); };
  const loadConversation = (conversation) => { if (busy) return; setMessages(conversation.messages); setTitle(conversation.title); setConversationId(conversation.id); setSidebarOpen(false); };

  const validateAndConnect = async () => {
    const key = keyInput.trim();
    if (!key) { setKeyError('Paste a Gemini API key to connect.'); return; }
    setCheckingKey(true); setKeyError('');
    try {
      const response = await fetch(`${API_BASE}/models/${model}?key=${encodeURIComponent(key)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'This API key is not valid.');
      localStorage.setItem(KEY_STORAGE, key); setApiKey(key); setApiModalOpen(false); setToast('Gemini is connected for this browser.');
    } catch (error) {
      setKeyError(error.message.includes('key') ? 'This API key is invalid or does not have access to the selected model.' : error.message);
    } finally { setCheckingKey(false); }
  };

  const askGemini = async (event) => {
    event?.preventDefault();
    const prompt = event?.currentTarget ? new FormData(event.currentTarget).get('prompt')?.trim() : '';
    if (!prompt || busy) return;
    if (!apiKey) { openApiModal(); return; }
    const nextTitle = messages.length ? title : (prompt.length > 34 ? `${prompt.slice(0, 34)}...` : prompt);
    const userMessages = [...messages, { role: 'user', text: prompt }];
    setBusy(true); setMessages(userMessages); setTitle(nextTitle); setStreamingText('');
    const inputMessages = [...userMessages];
    try {
      const response = await fetch(`${API_BASE}/interactions?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, stream: true, system_instruction: 'You are Dora the Explorer, a thoughtful, clear, and warm AI companion. Give useful answers with structure when it helps. Be concise unless the user asks for depth.', input: inputMessages.map((message) => ({ type: message.role === 'assistant' ? 'model_output' : 'user_input', content: [{ type: 'text', text: message.text }] })) })
      });
      if (!response.ok) { const text = await response.text(); let message = 'Dora the Explorer could not answer right now.'; try { message = JSON.parse(text.replace(/^data:\s*/, '').trim()).error?.message || message; } catch { message = text.replace(/^data:\s*/, '').trim() || message; } throw new Error(message); }
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Gemini returned an empty response.');
      const decoder = new TextDecoder(); let buffer = ''; let reply = '';
      while (true) {
        const { value, done } = await reader.read(); buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const events = buffer.split('\n'); buffer = events.pop() || '';
        events.forEach((line) => { if (!line.startsWith('data:')) return; try { const eventData = JSON.parse(line.slice(5).trim()); if (eventData.delta?.type === 'text') reply += eventData.delta.text || ''; if (eventData.step?.type === 'model_output') reply += (eventData.step.content || []).filter((item) => item.type === 'text').map((item) => item.text || '').join(''); setStreamingText(reply); } catch { /* Ignore incomplete SSE frames. */ } });
        if (done) break;
      }
      const finalMessages = [...userMessages, { role: 'assistant', text: reply || 'I could not find a response for that.' }];
      setMessages(finalMessages); persistConversation(finalMessages, nextTitle, conversationId);
    } catch (error) {
      const finalMessages = [...userMessages, { role: 'assistant', text: `I hit a snag: ${error.message}\n\nCheck your API key and model access, then try again.` }];
      setMessages(finalMessages); persistConversation(finalMessages, nextTitle, conversationId);
    } finally { setStreamingText(''); setBusy(false); }
  };

  const submitPrompt = (prompt) => { const form = new FormData(); form.set('prompt', prompt); askGemini({ preventDefault: () => {}, currentTarget: { get: () => prompt } }); };
  const connected = Boolean(apiKey);

  return <div className="app-shell">
    <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
      <div className="brand-row"><div className="brand-mark">D</div><span className="brand-name">Dora the Explorer</span><button className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar">&times;</button></div>
      <button className="new-chat-button" onClick={startNewConversation}><span>+</span> New conversation</button>
      <div className="sidebar-section"><div className="section-label">Workspace</div><button className="nav-item active"><span className="nav-icon">◌</span> Conversations</button><button className="nav-item" onClick={() => setToast('Saved thoughts are ready for a future pass.')}><span className="nav-icon">◇</span> Saved thoughts <span className="soon-label">soon</span></button></div>
      <div className="sidebar-section history-section"><div className="section-label">Recent</div><div className="history-list">{conversations.length ? conversations.map((conversation) => <button className="history-item" key={conversation.id} onClick={() => loadConversation(conversation)}>{conversation.title}</button>) : <div className="history-empty">Your conversations will appear here.</div>}</div></div>
      <div className="sidebar-footer"><button className="account-row" onClick={openApiModal}><div className="avatar">PM</div><div className="account-copy"><strong>Private workspace</strong><span>Local session</span></div><span className="more-icon">•••</span></button></div>
    </aside>
    <main className="main-panel">
      <header className="topbar"><button className="icon-button menu-button" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar">☰</button><div className="breadcrumb"><span>Conversations</span><span className="breadcrumb-slash">/</span><strong>{title}</strong></div><div className="topbar-actions"><label className="model-picker" aria-label="Choose Gemini model"><span className="model-label">Model</span><select value={model} onChange={(event) => { setModel(event.target.value); localStorage.setItem(MODEL_STORAGE, event.target.value); setToast(`${event.target.selectedOptions[0].text} selected.`); }}>{models.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><button className={`api-status ${connected ? 'connected' : ''}`} onClick={openApiModal}><span className="status-dot"></span>{connected ? 'Connected' : 'Connect API'}</button></div></header>
      <section className="chat-area">
        {!messages.length && <div className="welcome-state"><div className="eyebrow"><span className="eyebrow-line"></span> A calmer place to think</div><h1>What are we<br /><em>making sense of?</em></h1><p className="welcome-copy">A thoughtful AI companion for ideas, questions, and the messy middle between them.</p><div className="prompt-grid">{[['Shape an idea', 'Turn a rough thought into a clear plan', 'Help me turn a rough idea into a clear plan'], ['Learn something', 'Go deep on a curious question', 'Teach me something surprising about the world'], ['Make it better', 'Find the right words and tone', 'Help me write something that sounds clear and human'], ['Think it through', 'Sort the signal from the noise', 'I need to think through a difficult decision']].map(([heading, detail, prompt]) => <button className="prompt-card" key={heading} onClick={() => { const form = document.querySelector('#composer'); form.elements.prompt.value = prompt; form.elements.prompt.focus(); }}><span className="prompt-symbol"></span><span><strong>{heading}</strong><small>{detail}</small></span><span className="arrow">↗</span></button>)}</div></div>}
        <div className="message-list">{messages.map((message, index) => <article className={`message ${message.role === 'user' ? 'user' : 'assistant'}`} key={`${message.role}-${index}`}><div className="message-avatar">{message.role === 'user' ? 'PM' : 'D'}</div><div className="message-body"><div className="message-meta">{message.role === 'user' ? 'You' : 'Dora the Explorer'}</div><div className="message-copy" dangerouslySetInnerHTML={{ __html: message.role === 'user' ? escapeHtml(message.text).replace(/\n/g, '<br>') : renderMarkdown(message.text) }} /></div></article>)}{busy && <article className="message assistant"><div className="message-avatar">D</div><div className="message-body"><div className="message-meta">Dora the Explorer</div><div className="message-copy">{streamingText ? <div dangerouslySetInnerHTML={{ __html: renderMarkdown(streamingText) }} /> : <div className="typing"><i></i><i></i><i></i></div>}</div></div></article>}</div>
      </section>
      <div className="composer-wrap"><form className="composer" id="composer" onSubmit={askGemini}><textarea name="prompt" rows="1" placeholder="Ask anything..." aria-label="Message Dora the Explorer" onInput={(event) => { event.currentTarget.style.height = 'auto'; event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 130)}px`; }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form.requestSubmit(); } }} /><div className="composer-bottom"><div className="composer-tools"><button type="button" className="tool-button" onClick={() => setToast('File attachments are ready for a future pass.')}>＋ <span>Attach</span></button><span className="composer-hint">Dora the Explorer can make mistakes. Check important info.</span></div><button className="send-button" type="submit" disabled={busy} aria-label="Send message">↑</button></div></form></div>
      <div className="mobile-note">Built for thoughtful work, one conversation at a time.</div>
      <footer className="site-footer"><span>Created by <a className="creator-link" href="https://github.com/manava10" target="_blank" rel="noreferrer">Manav <span aria-hidden="true">↗</span></a></span><span className="footer-dot">·</span><a href="https://github.com/manava10/DoraTheExplorer" target="_blank" rel="noreferrer">Project GitHub <span aria-hidden="true">↗</span></a></footer>
    </main>
    {apiModalOpen && <div className="modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setApiModalOpen(false); }}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><button className="modal-close icon-button" onClick={() => setApiModalOpen(false)} aria-label="Close">&times;</button><div className="modal-kicker">Private connection</div><h2 id="modalTitle">Bring your own Gemini key</h2><p className="modal-copy">Your key stays in this browser and is sent only to Google Gemini when you send a message. It is never uploaded anywhere else.</p><label className="field-label" htmlFor="apiKeyInput">Gemini API key</label><div className="key-input-wrap"><input id="apiKeyInput" type="password" placeholder="AIza..." autoComplete="off" value={keyInput} onChange={(event) => setKeyInput(event.target.value)} /><button type="button" onClick={(event) => { const input = document.querySelector('#apiKeyInput'); input.type = input.type === 'text' ? 'password' : 'text'; event.currentTarget.textContent = input.type === 'text' ? 'Hide' : 'Show'; }}>Show</button></div><a className="help-link" href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">Get a key from Google AI Studio ↗</a><button className="connect-button" disabled={checkingKey} onClick={validateAndConnect}>{checkingKey ? 'Checking key...' : 'Save and connect'} <span>↗</span></button><p className="modal-error">{keyError}</p></div></div>}
    {toast && <div className="toast show" role="status">{toast}</div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
