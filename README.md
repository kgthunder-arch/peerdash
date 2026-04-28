# PeerDash

PeerDash is a browser-based peer-to-peer transfer app inspired by the instant room flow of apps like InShare and Xender.

## Highlights

- WebRTC data-channel transfer with chunked streaming and buffered backpressure control
- Sender/receiver room flow with six-character codes and QR handoff
- Multiple files in one queue, folder picking, transfer notes, and clipboard/text sharing
- Pause, resume, reconnect, cancel, and local transfer history
- Vite React client plus a lightweight Socket.IO signaling server

## Project structure

- `apps/client`: React + Vite frontend
- `apps/server`: Express + Socket.IO signaling server

## Run locally

```bash
npm install
npm run dev
```

## Deploy notes

The current Vercel project can build the static client with:

```bash
npm run build:vercel
```

The signaling server still needs a realtime host that supports long-lived WebSocket connections.
