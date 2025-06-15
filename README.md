# WaMi-Endpoint: WhatsApp Gateway Server

WaMi-Endpoint is a robust, multi-session Node.js backend server that acts as a bridge to the WhatsApp network. Built on top of [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys), it provides both a clean RESTful API and a real-time WebSocket interface, enabling client applications (like the WaMi Android Client) to programmatically send and receive WhatsApp messages, manage chats, and handle sessions.

---

## ✨ Key Features

* **Multi-Session Management**
  Run multiple WhatsApp accounts from a single server instance; each session is isolated and persists across restarts.
* **RESTful API**
  Comprehensive Express.js endpoints for session lifecycle, messaging, and chat history retrieval.
* **Real-time Events**
  Socket.IO integration pushes live events: new messages, message status updates (delivered, read), etc.
* **Persistent Storage**

  * **SQLite Database**: Caches all chats and messages for quick retrieval and history access.
  * **File-Based Sessions**: Authentication credentials are stored on disk under `./auth_sessions`.
* **Session Portability**
  Export/import session authentication as a ZIP archive to migrate without re-scanning QR codes.
* **Automatic Reconnection & Restore**
  On startup, previously saved sessions are restored; dropped connections auto-reconnect.
* **Media Handling**
  Incoming media (images, videos, documents) are auto-downloaded, stored under `./media`, and served via protected endpoints. Supports uploading/sending media files.
* **Structured Logging**
  Powered by Pino for configurable, structured logs.

---

## 🏛️ Architecture & Tech Stack

| Layer               | Technology / Library           | Responsibility                                   |
| ------------------- | ------------------------------ | ------------------------------------------------ |
| **API Layer**       | Express.js, Socket.IO          | Expose REST endpoints & real-time WebSocket API. |
| **WhatsApp Bridge** | @whiskeysockets/baileys        | Manage WhatsApp connection lifecycle & events.   |
| **Database**        | better-sqlite3                 | Persistence: chats & messages.                   |
| **File System**     | fs, Archiver, Unzipper, Multer | Store session credentials & media files.         |
| **Validation**      | express-validator              | API request validation.                          |
| **Logging**         | Pino                           | Structured, leveled logging.                     |
| **Env Management**  | dotenv                         | Centralized configuration via `.env` file.       |

---

## 📂 Directory Structure

```
└── wami-endpoint/
    ├── auth_sessions/       # Per-session auth credentials
    ├── media/               # Downloaded media files by session
    ├── src/
    │   ├── index.js         # Express & Socket.IO server
    │   ├── whatsapp-service.js  # Baileys integration
    │   ├── database.js      # SQLite schema & statements
    │   └── utils/           # Helpers: logging, validation, file ops
    ├── chat.db              # Default SQLite database file
    ├── .env.example         # Sample environment variables
    ├── package.json
    └── README.md
```

---

## 🔌 API Documentation

All authenticated endpoints require an HTTP header:

```
Authorization: Bearer <SESSION_ID>
```

### Session Management

| Method | Endpoint          | Auth Required | Description                                                    |
| ------ | ----------------- | ------------- | -------------------------------------------------------------- |
| POST   | `/session/create` | No            | Generates a new session ID and initializes a WhatsApp session. |
| GET    | `/status`         | Yes           | Returns connection status and a base64 QR code (if unpaired).  |
| POST   | `/session/logout` | Yes           | Logs out and deletes session credentials.                      |
| GET    | `/session/export` | Yes           | Downloads the session’s auth folder as `wami-session.zip`.     |
| POST   | `/session/import` | Yes           | Upload a ZIP to restore session (multipart/form-data).         |

### Chat & Message Endpoints

| Method | Endpoint         | Auth Required | Description                                                                   | Body / Query                                                         |
| ------ | ---------------- | ------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| GET    | `/chats`         | Yes           | Lists all chats (contact, last message, timestamp, unread count, avatar URL). | N/A                                                                  |
| GET    | `/history/:jid`  | Yes           | Retrieves message history for given JID; resets unread count.                 | `?limit=<number>` (optional)                                         |
| POST   | `/send`          | Yes           | Sends a text message.                                                         | `{ jid: string, text: string, tempId: string }`                      |
| POST   | `/send/media`    | Yes           | Sends a media message.                                                        | multipart: `file`, `jid`, `caption` (optional)                       |
| POST   | `/send/reaction` | Yes           | Sends an emoji reaction to a message.                                         | `{ jid: string, messageId: string, fromMe: boolean, emoji: string }` |

---

## 🌐 WebSocket Events (Socket.IO)

Clients must connect to the Socket.IO server with:

```js
const socket = io("http://<server-address>", {
  auth: { token: '<SESSION_ID>' }
});
```

| Event                            | Payload                                                                                                                         | Description                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `whatsapp-message`               | `{ id, jid, text, type, isOutgoing, status, timestamp, name, media_url?, mimetype?, quoted_message_id?, quoted_message_text? }` | Emitted on incoming or outgoing message.              |
| `whatsapp-message-status-update` | `{ id, status }`                                                                                                                | Emitted when message status changes (delivered/read). |

---

## ⚙️ Setup & Running

### Prerequisites

* Node.js v18.x or newer
* npm (Bundled with Node.js)

### Installation

```bash
# Clone the repository
git clone https://github.com/rad1914/WaMi-Backend.git
cd wami-endpoint

# Install dependencies
npm install
```

### Configuration

Copy the example environment file and edit as needed:

```bash
cp .env.example .env
```

**.env**

```ini
# Server configuration
PORT=3007

# Directories
SESSIONS_DIR=./auth_sessions
MEDIA_DIR=./media

# Database path
SQLITE_PATH=./chat.db

# Logging
LOG_LEVEL=info
NODE_ENV=production
```

### Running

* **Development** (hot-reloading, pretty logs):

  ```bash
  npm run dev
  ```

* **Production**:

  ```bash
  npm start
  ```

Server logs will indicate restoration of any existing sessions and startup status.

---

## 📜 License

[MIT License](LICENSE)

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check [issues page](https://github.com/rad1914/WaMi-Backend/issues).

---

~ Made with <3 by @RADWrld
