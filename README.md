# Kodari PDF

A fast, privacy-first PDF reader that works **online in the browser** and as an **installable Windows desktop app** (via Electron).

## Features

- Open PDF files via button, drag & drop, or menu (desktop)
- Page navigation (arrows, keyboard shortcuts, page jump)
- Zoom in / out / reset / fit-to-width
- Text selection and in-document search highlighting
- Thumbnail sidebar for quick page preview
- Dark mode / Light mode
- File never leaves your device — 100% local processing

---

## Tech Stack

| Layer      | Technology |
|------------|------------|
| UI         | React 18 + Vite |
| PDF engine | PDF.js (pdfjs-dist) |
| Desktop    | Electron 32 |
| Installer  | electron-builder (NSIS) |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Install dependencies

```bash
npm install
```

---

## Running the App

### Web (browser)

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Desktop (Electron — development)

```bash
npm run electron:dev
```

This starts Vite and Electron together.

---

## Building

### Web build (for hosting/deployment)

```bash
npm run build
```

Output goes to `dist/`. Deploy that folder to any static host (Netlify, Vercel, GitHub Pages, etc.).

### Windows installer (.exe)

```bash
npm run electron:build
```

Output goes to `dist-electron/`. You'll get:
- `Kodari PDF Setup x.x.x.exe` — NSIS installer (per-machine or per-user)
- `Kodari PDF x.x.x.exe` — Portable executable (no install needed)

### Linux AppImage / deb

```bash
npm run electron:build:linux
```

### macOS DMG

```bash
npm run electron:build:mac
```

---

## Keyboard Shortcuts

| Key           | Action             |
|---------------|--------------------|
| `→` / `↓`    | Next page          |
| `←` / `↑`    | Previous page      |
| `Home`        | First page         |
| `End`         | Last page          |
| `+` / `=`     | Zoom in            |
| `-`           | Zoom out           |
| `0`           | Reset zoom (100%)  |
| `Ctrl+O`      | Open file (desktop)|

---

## Project Structure

```
kodari_pdf/
├── electron/
│   ├── main.js          # Electron main process
│   └── preload.js       # Context bridge (IPC)
├── src/
│   ├── components/
│   │   ├── PDFViewer.jsx  # PDF canvas renderer
│   │   ├── Toolbar.jsx    # Top navigation bar
│   │   ├── Sidebar.jsx    # Thumbnail panel
│   │   └── DropZone.jsx   # Welcome / drag-drop screen
│   ├── App.jsx            # Root app state
│   ├── main.jsx           # React entry point
│   └── index.css          # Global styles
├── public/
│   └── icon.svg
├── index.html
├── vite.config.js
└── package.json
```

---

## Privacy

All PDF processing happens locally in your browser or on your machine. No files are uploaded to any server.
