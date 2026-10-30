# Cortex AI

A simple, flat, red-accented chat interface inspired by modern AI
workspaces. Focused around a clean composer, a compact sidebar, streaming
answers, DeepThink, and markdown rendering.

No build step, no frameworks, no Node. Just HTML, CSS, and vanilla JavaScript.

## Deploy to Netlify

1. Push this folder to a GitHub repo.
2. On Netlify, **Import from Git** and pick that repo.
3. Build command: leave as is, Publish directory: `cortex-ai`.
4. Under **Site settings → Environment variables**, add `NVIDIA_API_KEY`.
5. Deploy.

`netlify.toml` wires `/api/nim` to a Netlify function. It forwards chat
requests to NVIDIA NIM using the key from your environment.

## Run locally

```bash
cd cortex-ai
python3 server.py 8000
# then visit http://localhost:8000
```

`server.py` serves the static site and proxies `/v1/chat/completions` to
NVIDIA NIM for real model replies. Keep it running at port 8000.

## What's inside

```
cortex-ai/
├── index.html
├── assets/
│   ├── favicon.svg
│   └── logo.svg
├── css/
│   ├── tokens.css       design tokens + red-accent dark/light palettes
│   ├── style.css        layout, components, responsive rules
│   └── animations.css   minimal keyframes and motion preferences
├── js/
│   ├── theme.js         applies the saved theme before first paint
│   ├── chat.js          tiny markdown renderer + NVIDIA NIM wrapper
│   └── app.js           chat state, streaming, sidebar, palette, toasts
└── server.py            local static server + NVIDIA NIM proxy
```

```
netlify/
└── functions/
    └── nim.js           NVIDIA NIM proxy for Netlify deployments
```

## Features

- **Simple red theme** — neutral dark or light UI, one accent color, no
  gradients.
- **Compact layout** — sidebar, centered greeting, floating composer.
- **AI logo** — angular logo used as favicon, brand mark, and assistant avatar.
- **NVIDIA NIM** — chat requests are streamed to `/v1/chat/completions` and
  handled by `server.py`; if NIM is disabled, the site falls back to built-in
  demo replies.
- **Streaming answers** — token-by-token text, a blinking caret, stop
  generation, regenerate, copy, and feedback buttons.
- **Markdown rendering** — bold, italics, lists, quotes, headings, inline
  code, and fenced code blocks with copy buttons.
- **Command palette** — `Ctrl/Cmd + K` for new chat, theme, share, and
  clearing history.
- **Themes** — dark by default, light mode persisted in `localStorage`.
- **Local history** — conversations are saved in the browser and can be
  searched, reopened, or deleted.
- **Responsive** — the sidebar becomes a drawer and the composer compacts.

## Shortcuts

| Keys | Action |
| --- | --- |
| `Enter` | Send |
| `Shift + Enter` | New line |
| `Ctrl/Cmd + K` | Command palette |
| `Ctrl/Cmd + Shift + O` | New chat |
| `/` | Focus the composer |
| `Esc` | Close menus / drawer / palette |

## Notes

You set the API key in `server.py` under `DEFAULT_NVIDIA_API_KEY`. If you later
rotate it, just update that constant or run:

```bash
export NVIDIA_API_KEY="your-real-key"
python3 server.py 8000
```

If NIM is unreachable, the site silently falls back to built-in demo replies so
the UI never breaks.
