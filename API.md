# CollabHub API & WebSocket Documentation

This document describes all REST API endpoints and Socket.io real-time events for the CollabHub chatting platform, including all recent updates (specific replies, customization settings, and administrative pruning).

---

## 1. REST API Endpoints

### Authentication (`/api/auth`)

#### Register User
* **Method & Route:** `POST /api/auth/signup`
* **Request Body:**
  ```json
  {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "password": "strongpassword123"
  }
  ```
* **Success Response (201 Created):**
  ```json
  {
    "success": true,
    "message": "User registered successfully",
    "token": "JWT_TOKEN_STRING",
    "user": { "id": "uuid", "name": "Jane Doe", "email": "jane@example.com", "role": "user" }
  }
  ```

#### Login User
* **Method & Route:** `POST /api/auth/login`
* **Request Body:**
  ```json
  {
    "email": "jane@example.com",
    "password": "strongpassword123"
  }
  ```
* **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "token": "JWT_TOKEN_STRING",
    "user": { "id": "uuid", "name": "Jane Doe", "email": "jane@example.com", "role": "user" }
  }
  ```

#### Fetch Profile
* **Method & Route:** `GET /api/auth/me`
* **Headers:** `Authorization: Bearer JWT_TOKEN`
* **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "user": {
      "id": "uuid",
      "name": "Jane Doe",
      "username": "janedoe",
      "email": "jane@example.com",
      "avatar": "data:image/png;base64,... or URL",
      "bio": "Collaborating on design layouts.",
      "theme": "dark",
      "accentColor": "#004ad3",
      "fontSize": "medium",
      "role": "user"
    }
  }
  ```

#### Update Profile & Customizations (Auto-saves instantly)
* **Method & Route:** `PUT /api/auth/profile`
* **Headers:** `Authorization: Bearer JWT_TOKEN`
* **Request Body (Partial values allowed):**
  ```json
  {
    "name": "Jane Doe",
    "username": "janedoe",
    "bio": "Updated bio text",
    "theme": "dark",
    "accentColor": "#004ad3",
    "fontSize": "large"
  }
  ```
* **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Profile updated successfully",
    "user": { ... }
  }
  ```

---

### Conversations & Messages (`/api/chats`)

#### Get User Conversations
* **Method & Route:** `GET /api/chats`
* **Headers:** `Authorization: Bearer JWT_TOKEN`
* **Success Response (200 OK) (Sorted by `lastMessageTime` Descending):**
  ```json
  [
    {
      "id": "convo-uuid",
      "type": "direct",
      "unreadCount": 0,
      "lastMessage": "Sounds good!",
      "lastMessageTime": "2026-07-01T13:00:00Z",
      "user": { "id": "recipient-uuid", "name": "Jamali", "avatar": "JM" }
    }
  ]
  ```

#### Fetch Message History
* **Method & Route:** `GET /api/chats/:id/messages`
* **Headers:** `Authorization: Bearer JWT_TOKEN`
* **Success Response (200 OK) (Includes full `metadata` payloads for replies/attachments):**
  ```json
  [
    {
      "id": "msg-uuid",
      "senderId": "sender-uuid",
      "senderName": "Jamali",
      "senderAvatar": "JM",
      "content": "Sure, here is the spec sheet.",
      "timestamp": "2026-07-01T12:50:00Z",
      "status": "read",
      "attachment": {
        "name": "specs.pdf",
        "type": "application/pdf",
        "size": 250000,
        "url": "/uploads/17828397-specs.pdf"
      },
      "metadata": {
        "replyTo": {
          "id": "parent-msg-uuid",
          "senderName": "Jane Doe",
          "content": "Can you send the PDF?"
        }
      }
    }
  ]
  ```

#### Fetch Recent Message Activity (Dashboard feed)
* **Method & Route:** `GET /api/chats/recent-activity`
* **Headers:** `Authorization: Bearer JWT_TOKEN`
* **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "activity": [
      {
        "id": "msg-uuid",
        "content": "Draft layout review.",
        "createdAt": "2026-07-01T13:45:00Z",
        "conversationId": "convo-uuid",
        "senderId": "sender-uuid",
        "senderName": "Neema",
        "senderAvatar": "NM",
        "chatType": "group",
        "groupName": "Design Team"
      }
    ]
  }
  ```

---

### Notifications (`/api/notifications`)

#### Update Notification Preferences
* **Method & Route:** `PUT /api/notifications/settings`
* **Headers:** `Authorization: Bearer JWT_TOKEN`
* **Request Body:**
  ```json
  {
    "push_enabled": true,
    "sound": true,
    "vibration": false,
    "popup": true,
    "show_preview": true,
    "dnd_start": "22:00:00",
    "dnd_end": "08:00:00"
  }
  ```
* **Success Response (200 OK):**
  ```json
  { "success": true, "message": "Notification preferences updated." }
  ```

---

### Workspace Administration (`/api/admin`)
* *Protected:* Requires request token of user with role `'admin'` or `'superadmin'`.

#### Storage Pruning (File Decoupling Utility)
* **Method & Route:** `POST /api/admin/prune-attachments`
* **Headers:** `Authorization: Bearer JWT_TOKEN`
* **Request Body:**
  ```json
  {
    "days": 14
  }
  ```
* **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Pruning complete. Successfully purged 42 attachment files from server storage.",
    "prunedCount": 42
  }
  ```

---

## 2. WebSocket Real-Time Events (Socket.io)

### Client to Server Emitters

#### Join Conversation Room
* **Event Name:** `join-room`
* **Payload:** `{ "conversationId": "convo-uuid", "userId": "user-uuid" }`

#### Send Message
* **Event Name:** `send-message`
* **Payload:**
  ```json
  {
    "conversationId": "convo-uuid",
    "senderId": "user-uuid",
    "content": "Replying to this now.",
    "tempId": "local-optimistic-uuid",
    "attachment": {
      "name": "snapshot.jpeg",
      "type": "image/jpeg",
      "size": 142000,
      "data": "data:image/jpeg;base64,..."
    },
    "metadata": {
      "replyTo": {
        "id": "parent-msg-uuid",
        "senderName": "Neema",
        "content": "Can you check this?"
      }
    }
  }
  ```

#### Broadcast Typing Status
* **Event Name:** `typing`
* **Payload:** `{ "conversationId": "convo-uuid", "userId": "user-uuid", "name": "Jane", "isTyping": true }`

#### Global Message Deletion
* **Event Name:** `delete-message`
* **Payload:** `{ "messageId": "msg-uuid", "conversationId": "convo-uuid" }`

---

### Server to Client Listeners

#### Message Received
* **Event Name:** `message-received`
* **Payload:** Contains the newly generated db-persisted message structure carrying attachments and `metadata` for replies.

#### Typing Status
* **Event Name:** `typing-status`
* **Payload:** `{ "conversationId": "convo-uuid", "name": "Jane", "avatar": "avatar_path", "isTyping": true }`

#### Message Deleted Broadcast
* **Event Name:** `message-deleted`
* **Payload:** `{ "messageId": "msg-uuid", "conversationId": "convo-uuid" }`
