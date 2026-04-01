---
summary: "Fly custom WebSocket channel for self-developed IM server integration"
read_when:
  - Working on Fly channel features
title: "Fly"
---

# Fly (Custom WebSocket Channel)

Status: experimental. Self-developed custom messaging channel via WebSocket with authentication support.

## Plugin required

Fly ships as a plugin and is not bundled with the core install.

- Install via CLI: `openclaw plugins install @openclaw/fly-channel`
- Or select **Fly** during setup and confirm the install prompt
- Details: [Plugins](/tools/plugin)

## Quick setup

1. Install the Fly plugin:
   - From a source checkout: `openclaw plugins install ./extensions/fly-channel`
   - From npm (if published): `openclaw plugins install @openclaw/fly-channel`
   - Or pick **Fly** in setup and confirm the install prompt
2. Configure the WebSocket server URL and auth token (see [Configuration reference](#configuration-reference-fly))
3. Restart the gateway (or finish setup)

Minimal config:

```json5
{
  channels: {
    fly: {
      enabled: true,
      accounts: {
        default: {
          wsUrl: "ws://localhost:8080/ws",
          token: "your-auth-token",
          dmPolicy: "pairing",
        },
      },
    },
  },
}
```

## What it is

Fly is a self-developed custom messaging channel that connects to any IM server via WebSocket. It provides:

- **WebSocket connectivity** to custom IM servers
- **Token-based authentication** with the server
- **Automatic reconnection** with exponential backoff
- **Message sending/receiving** via WebSocket protocol

## Protocol

The Fly channel expects a WebSocket server that follows this simple protocol:

### Authentication

After connecting, send an auth message:

```json
{
  "type": "auth",
  "token": "your-auth-token"
}
```

Server should respond:

```json
{
  "type": "auth_ack",
  "ok": true,
  "userId": "user-id-here"
}
```

### Sending Messages

```json
{
  "type": "message",
  "to": "recipient-id",
  "content": "Hello!",
  "timestamp": 1712000000000
}
```

### Receiving Messages

```json
{
  "type": "message",
  "id": "msg-id",
  "from": "sender-id",
  "to": "recipient-id",
  "content": "Hi there!",
  "timestamp": 1712000001000
}
```

### Heartbeat

Server may send:

```json
{
  "type": "ping"
}
```

Client should respond:

```json
{
  "type": "pong"
}
```

## Capabilities

| Feature              | Status           |
| -------------------- | ---------------- |
| Direct messages      | ✅ Supported     |
| Groups               | ❌ Not supported |
| Media                | ❌ Not supported |
| Reactions            | ❌ Not supported |
| Threads              | ❌ Not supported |
| Polls                | ❌ Not supported |
| Native commands      | ❌ Not supported |
| Streaming            | ⚠️ Blocked       |
| WebSocket connection | ✅ Supported     |
| Token authentication | ✅ Supported     |
| Auto reconnection    | ✅ Supported     |

## Architecture

The Fly channel plugin follows the standard OpenClaw channel plugin structure:

```
extensions/fly-channel/
├── package.json           # NPM package with openclaw.channel metadata
├── openclaw.plugin.json   # Plugin manifest
├── index.ts              # defineChannelPluginEntry
├── setup-entry.ts        # defineSetupPluginEntry
└── src/
    ├── channel.ts        # ChannelPlugin object
    ├── runtime.ts        # Runtime store initialization
    ├── runtime-api.ts    # Type definitions
    ├── config-schema.ts  # Config validation schema
    ├── probe.ts          # Health check
    ├── send.ts           # Outbound messaging
    ├── monitor.ts        # Inbound message handling
    └── ws-client.ts      # WebSocket client with reconnection
```

### Key components

**`ws-client.ts`** - WebSocket client implementation:

- Connection management with auto-reconnect
- Token-based authentication
- Message parsing and serialization
- Status sink for connection state

**`monitor.ts`** - Inbound message handling:

- WebSocket connection lifecycle
- Message routing to reply pipeline (TODO)
- DM policy enforcement

**`send.ts`** - Outbound messaging:

- Fire-and-forget message sending
- WebSocket connection for one-shot sends

## Configuration reference (Fly)

Full configuration: [Configuration](/gateway/configuration)

Provider options:

- `channels.fly.enabled`: enable/disable channel startup.
- `channels.fly.accounts.<id>.wsUrl`: WebSocket server URL (e.g., `ws://localhost:8080/ws` or `wss://example.com/ws`).
- `channels.fly.accounts.<id>.token`: Authentication token for the IM server.
- `channels.fly.accounts.<id>.tokenFile`: Read token from file path instead of config.
- `channels.fly.accounts.<id>.dmPolicy`: `pairing | allowlist | open | disabled` (default: pairing).
- `channels.fly.accounts.<id>.allowFrom`: DM allowlist (user IDs). `open` requires `"*"`.
- `channels.fly.accounts.<id>.reconnectDelayMs`: Reconnect delay in ms (default: 1000).
- `channels.fly.accounts.<id>.maxReconnectDelayMs`: Max reconnect delay in ms (default: 30000).
- `channels.fly.accounts.<id>.textChunkLimit`: Message chunk size limit.

Environment variable fallback: `FLY_AUTH_TOKEN`

## Delivery targets (CLI/cron)

- Use a target ID as the target.
- Example: `openclaw message send --channel fly --target user123 --message "hi"`

## Troubleshooting

**Channel not starting:**

- Check that the plugin is installed: `openclaw plugins list`
- Verify WebSocket URL is valid: must be `ws://` or `wss://`
- Check gateway logs: `openclaw logs --follow`

**Authentication failing:**

- Verify token is correct
- Check server logs for auth errors
- Try connecting with a WebSocket client tool

**Messages not sending:**

- Check WebSocket connection: `openclaw channels status --probe`
- Verify network connectivity to WebSocket server
- Check firewall rules

---

# Fly IM System Implementation

This document describes the complete Fly IM system implementation including a Python WebSocket server and Vue H5 client.

## System Architecture

```
┌─────────────────┐     WebSocket      ┌─────────────────┐
│   OpenClaw      │◄─────────────────►│                 │
│  fly-channel    │   ws://.../ws     │   Python IM     │
│                 │                   │   Server        │
└─────────────────┘                   └────────┬────────┘
                                                │
                                         ┌──────▼────────┐
                                         │   SQLite DB   │
                                         └───────────────┘
                                                ▲
                                                │ HTTP REST
                                         ┌──────┴────────┐
                                         │   Vue H5      │
                                         │   Client      │
                                         └───────────────┘
```

## Protocol Specification

### Message Types

| Type       | Direction     | Description                     |
| ---------- | ------------- | ------------------------------- |
| `auth`     | Client→Server | Authentication request          |
| `auth_ack` | Server→Client | Authentication response         |
| `message`  | Bidirectional | Chat message                    |
| `ping`     | Server→Client | Heartbeat request               |
| `pong`     | Client→Server | Heartbeat response              |
| `ack`      | Server→Client | Message delivery acknowledgment |
| `error`    | Server→Client | Error notification              |

### Message Format

All messages are JSON:

```json
{
  "type": "message",
  "id": "msg-uuid",
  "from": "user-id",
  "to": "recipient-id",
  "content": "Hello!",
  "timestamp": 1712000000000,
  "metadata": {}
}
```

## Python IM Server

Location: `docs/channels/fly-im-server/`

### Tech Stack

- **Framework**: FastAPI + uvicorn
- **WebSocket**: fastapi websockets
- **Database**: SQLite (via SQLAlchemy)
- **Auth**: JWT tokens

### API Endpoints

#### REST API

| Method | Path                            | Description         |
| ------ | ------------------------------- | ------------------- |
| POST   | `/api/auth/register`            | Register new user   |
| POST   | `/api/auth/login`               | Login and get token |
| GET    | `/api/users/{user_id}`          | Get user info       |
| GET    | `/api/users/{user_id}/contacts` | Get user contacts   |
| POST   | `/api/users/{user_id}/contacts` | Add contact         |
| GET    | `/api/messages/{user_id}`       | Get message history |

#### WebSocket

| Path  | Description             |
| ----- | ----------------------- |
| `/ws` | Main WebSocket endpoint |

### Database Schema

```sql
-- Users table
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Contacts table
CREATE TABLE contacts (
  user_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, contact_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (contact_id) REFERENCES users(id)
);

-- Messages table
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  delivered_at INTEGER,
  read_at INTEGER,
  FOREIGN KEY (from_user_id) REFERENCES users(id),
  FOREIGN KEY (to_user_id) REFERENCES users(id)
);

-- Indexes
CREATE INDEX idx_messages_from ON messages(from_user_id);
CREATE INDEX idx_messages_to ON messages(to_user_id);
CREATE INDEX idx_messages_timestamp ON messages(timestamp);
```

### Installation & Running

```bash
cd docs/channels/fly-im-server

# Create virtual environment
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows

# Install dependencies
pip install -r requirements.txt

# Run server
uvicorn main:app --host 0.0.0.0 --port 8080 --reload
```

### Server Configuration

Environment variables:

| Variable           | Default                 | Description                       |
| ------------------ | ----------------------- | --------------------------------- |
| `DATABASE_URL`     | `sqlite:///./fly_im.db` | Database connection string        |
| `SECRET_KEY`       | (required)              | JWT secret key                    |
| `WS_PING_INTERVAL` | `30`                    | WebSocket ping interval (seconds) |
| `WS_PING_TIMEOUT`  | `10`                    | WebSocket ping timeout (seconds)  |

## Vue H5 Client

Location: `docs/channels/fly-h5-client/`

### Tech Stack

- **Framework**: Vue 3 + Composition API
- **Build**: Vite
- **HTTP**: Axios
- **WebSocket**: Native WebSocket API
- **State**: Pinia
- **Router**: Vue Router 4
- **UI**: TailwindCSS + HeadlessUI

### Features

| Feature          | Description                 |
| ---------------- | --------------------------- |
| Login/Register   | User authentication         |
| Contact List     | View and manage contacts    |
| Chat             | Real-time messaging         |
| Message History  | Load older messages         |
| Online Status    | Show online/offline status  |
| Typing Indicator | Show when contact is typing |

### Pages

| Route           | Component    | Description       |
| --------------- | ------------ | ----------------- |
| `/login`        | LoginPage    | User login        |
| `/register`     | RegisterPage | User registration |
| `/`             | HomePage     | Contact list      |
| `/chat/:userId` | ChatPage     | Chat conversation |

### API Service

```typescript
// src/services/api.ts
const API_BASE = 'http://localhost:8080/api'

// REST API
export const api = {
  register(username, password, displayName)
  login(username, password)
  getUser(userId)
  getContacts(userId)
  addContact(userId, contactId)
  getMessages(userId, limit, before)
}

// WebSocket
export function createWebSocket(token, handlers)
```

### WebSocket Handler

```typescript
interface WsHandlers {
  onOpen: () => void;
  onClose: () => void;
  onError: (error) => void;
  onMessage: (message) => void;
  onAuthAck: (result) => void;
  onAck: (messageId) => void;
}
```

## Integration

### OpenClaw Configuration

```json5
{
  channels: {
    fly: {
      enabled: true,
      accounts: {
        default: {
          wsUrl: "ws://localhost:8080/ws",
          token: "your-jwt-token",
          dmPolicy: "pairing",
        },
      },
    },
  },
}
```

### End-to-End Flow

1. **User registers** on Vue H5 client → Server stores user
2. **User logs in** → Server returns JWT token
3. **Client connects WebSocket** with JWT token
4. **Server validates token**, sends `auth_ack`
5. **OpenClaw connects** to same WebSocket with its own token
6. **Users chat** via WebSocket messages
7. **OpenClaw AI responses** routed back through server

## See also

- [Channel Plugin Development](/guides/channel-plugin-development)
- [Plugins](/tools/plugin)
- [Configuration](/gateway/configuration)
