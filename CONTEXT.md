# Project context (for AI / next session)

This file summarizes what this app does, how it’s built, and where to look so the next agent or session can continue without losing context.

## What this app is

**Present Slides** – Web app where users:
1. Upload a PDF
2. View **one page at a time** (large, sharp display on the left)
3. See **AI-generated explanations** for the current page in a **right side panel**
4. Use **Previous / Next** to move between pages

Explanations are generated **once per PDF** (all pages) at upload time (Groq or Gemini), then the side panel just shows the text for the current page. No re-calling the API when flipping pages.

## Stack

- **React 18** + **Vite**
- **PDF.js** (`pdfjs-dist`) – render PDF pages to canvas
- **AI**: **Groq** (Llama 4 Scout vision) and/or **Google Gemini** (gemini-2.0-flash, gemini-pro-vision, etc.)
- **Side panel text**: **react-markdown** + **remark-math** + **rehype-katex** (KaTeX) so explanations support **Markdown** and **LaTeX** math

## Env

- `VITE_GROQ_API_KEY` – Groq (used first if set)
- `VITE_GEMINI_API_KEY` – Gemini (fallback if Groq fails or no Groq key)

At least one must be set. If both are set, Groq is tried first to avoid Gemini rate limits.

## Key files

| Path | Purpose |
|------|--------|
| `src/App.jsx` | Root state, file upload, `generateAllExplanations()` (Groq + Gemini, per-page loop, retries, image sizing for Groq 4MB limit) |
| `src/components/PDFViewer.jsx` | Loads PDF, renders current page to canvas (HiDPI-aware, fills container) |
| `src/components/SidePanel.jsx` | Shows “Page N Explanation”, progress, errors; renders explanation with ReactMarkdown + KaTeX |
| `src/components/FileUpload.jsx` | Drag-and-drop / file picker for PDF |

## Important behavior

- **PDF quality/size**: Canvas is rendered at `scale * devicePixelRatio`; CSS width/height set to logical size so the PDF is sharp and fills the left column. Container background is dark gray (`#525252`).
- **Groq**: 4MB base64 limit – if page image is too large, it’s scaled down / JPEG before sending.
- **Rate limits**: On 429, we retry with backoff (Gemini). If both providers fail, side panel shows a short quota message and link to rate limits.
- **Progress**: While generating, side panel shows “Generating page X of Y” and a progress bar.

## Conventions

- No backend – all logic in the browser (Vite dev server is static).
- API keys are Vite env vars (`VITE_*`) so they’re available in the client (don’t put real keys in the repo; use `.env` and keep it in `.gitignore`).

---

*Last updated to reflect: Groq + Gemini, markdown/LaTeX in side panel, PDF display quality/size fixes, progress UI, rate-limit handling.*
