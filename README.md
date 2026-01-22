# Custom Chatbot Platform

A Docker-based chatbot platform supporting **FAQ**, **Workflow**, and **RAG (PDF-based)** conversations.  
Everything runs locally using Docker Compose.

---

## Core Idea

Each chatbot answers user messages in this order:

1. **FAQ** – exact question match  
2. **Workflow** – node-based conversation flow  
3. **RAG** – semantic search over uploaded PDFs  

All chats are stored and replayable.

---

## Tech Stack

### Frontend
- Next.js (App Router)
- TypeScript
- React Flow (workflow UI)
- graphql-request (Hasura)

### Backend (RAG Service)
- FastAPI
- OCR: Tesseract + pytesseract
- PDF parsing: pdfplumber
- Text chunking
- Embeddings: Ollama (`nomic-embed-text`)
- Vector DB: Qdrant
- LLM (generation): Groq API

### Storage
- PostgreSQL (via Hasura)
- MinIO (PDF storage)
- Qdrant (vector storage)

### Infrastructure
- Docker Compose
- Everything runs locally (no hosting)

---

## Chat Resolution Flow

User Message
↓
FAQ (exact match)
↓
Workflow (userMessage match)
↓
RAG (PDF search + LLM)


---

## Database Tables
📘 Chatbot Project – PostgreSQL DB Schema (Quick Notes)
________________________________________

🟢 1. chatbots — Core Master Table

Purpose:  
Stores basic chatbot configuration and identity.

Columns:  
• id (UUID, PK) → Unique chatbot identifier  
• name (Text) → Chatbot name  
• start_message (Text) → First message shown to user  
• created_at (Timestamp) → Creation time (default: now())

Notes:  
• Parent table for most relationships  
• One record = one chatbot  

________________________________________

🟢 2. faqs — Static Question–Answer Data

Purpose:  
Stores predefined FAQs related to a chatbot.

Columns:  
• id (UUID, PK)  
• chatbot_id (UUID, FK → chatbots.id)  
• question (Text)  
• answer (Text)

Relationships:  
• Many FAQs → One chatbot  

Notes:  
• Used for instant responses without workflow logic  

________________________________________

🟢 3. workflows — Conversation Flow Logic

Purpose:  
Stores chatbot conversation logic as JSON.

Columns:  
• id (UUID, PK)  
• chatbot_id (UUID, FK → chatbots.id)  
• flow_json (JSONB) → Nodes, messages, options, positions  

Notes:  
• One workflow per chatbot  
• JSONB allows flexible flow design  
• Used for guided conversations  

________________________________________

🟢 4. chat_sessions — User Interaction Session

Purpose:  
Tracks each chatbot interaction session.

Columns:  
• id (UUID, PK)  
• chatbot_id (UUID, FK → chatbots.id)  
• created_at (Timestamp)

Notes:  
• Each page reload = new session  
• Groups messages logically  

________________________________________

🟢 5. chat_messages — Chat History

Purpose:  
Stores all messages exchanged in a session.

Columns:  
• id (UUID, PK)  
• session_id (UUID, FK → chat_sessions.id)  
• sender (Text) → user / bot  
• message (Text)  
• created_at (Timestamp)

Notes:  
• Core table for chat history  
• Used for analytics, logs, and debugging  

________________________________________

🔗 Relationship Summary (One Line)

• chatbot → FAQs, workflow, sessions  
• session → messages  

________________________________________

## Workflow JSON Structure

```json
/**
 * Example workflow JSON stored in database (flow_json):
 
  {
    "nodes": [
      {
        "id": "node-1",
        "userMessage": "Check order status",
        "botReply": "Please enter your order number.",
        "options": [
          { "nextNodeId": "node-2" }
        ],
        "position": { "x": 100, "y": 120 }
      },
      {
        "id": "node-2",
        "userMessage": "Talk to support",
        "botReply": "Connecting you to support.",
        "options": [],
        "position": { "x": 420, "y": 260 }
      }
    ]
  }
 /
```
---

## RAG Pipeline

```text
PDF Upload
 → OCR (mandatory)
 → Text Chunking
 → Embeddings (local)
 → Store in Qdrant
 → User Query
 → Similar Chunk Search
 → Prompt Creation
 → Groq LLM Response
Notes:

OCR is mandatory for all PDFs.

Embeddings and vector search are fully local.

Only the final response generation uses Groq (cloud).

No document data is sent to the cloud.
```

## Services & URLs
Service	URL
```
Frontend	http://localhost:3000
Hasura Console	http://localhost:8080
Hasura GraphQL API	http://localhost:8080/v1/graphql
RAG Backend API	http://localhost:8000
MinIO UI	http://localhost:12001
Qdrant Dashboard	http://localhost:6333/dashboard
Ollama	http://localhost:11434

RAG API
Endpoint
POST /chat/rag?chatbot_id=UUID&user_message=TEXT
Request Body (Optional – Chat History)
[
  { "role": "user", "content": "previous message" },
  { "role": "bot", "content": "previous reply" }
]

```
## Current Features
Admin chatbot CRUD

FAQ management

Workflow editor (drag & drop)

User chat UI

Session & message storage

PDF upload via backend API

OCR and text chunking

Vector search using Qdrant

RAG-based responses using Groq LLM

## Architecture Overview
Frontend: Admin panel and user chat UI

Backend (RAG API): OCR, chunking, embeddings, retrieval, prompt creation

Vector Database: Qdrant

Object Storage: MinIO (PDFs)

Metadata & Auth: Hasura (PostgreSQL)

LLM: Groq (generation only)

## Local-First Design
PDFs, extracted text, embeddings, and vectors stay local.

Cloud usage is limited strictly to LLM inference.

Designed for privacy, performance, and cost efficiency.
