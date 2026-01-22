from fastapi.middleware.cors import CORSMiddleware

from app.vector_store import store_embeddings

from app.embeddings import embed_texts
from app.ocr import extract_text_from_pdf
from app.chunking import split_into_chunks

from app.vector_store import search_similar_chunks
from app.rag import build_prompt, ask_llm



from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from minio import Minio
import os

app = FastAPI(title="RAG Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---- MinIO configuration ----
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY")
MINIO_BUCKET = os.getenv("MINIO_BUCKET")

if not all([MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET]):
    raise RuntimeError("MinIO environment variables are not set")

minio_client = Minio(
    MINIO_ENDPOINT,
    access_key=MINIO_ACCESS_KEY,
    secret_key=MINIO_SECRET_KEY,
    secure=False,
)

# ---- Startup: ensure bucket exists ----
@app.on_event("startup")
def ensure_bucket():
    if not minio_client.bucket_exists(MINIO_BUCKET):
        minio_client.make_bucket(MINIO_BUCKET)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/documents/upload")
async def upload_pdf(
    chatbot_id: str = Form(...),
    file: UploadFile = File(...)
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    object_name = f"{chatbot_id}/{file.filename}"

    try:
        minio_client.put_object(
            bucket_name=MINIO_BUCKET,
            object_name=object_name,
            data=file.file,
            length=-1,
            part_size=10 * 1024 * 1024,
            content_type=file.content_type,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "message": "PDF uploaded successfully",
        "chatbot_id": chatbot_id,
        "object_name": object_name,
    }

@app.post("/documents/ocr")
def ocr_document(
    chatbot_id: str,
    filename: str,
):
    """
    OCR a PDF already uploaded to MinIO.
    """

    object_name = f"{chatbot_id}/{filename}"

    text = extract_text_from_pdf(
        minio_client=minio_client,
        bucket_name=MINIO_BUCKET,
        object_name=object_name,
    )

    return {
        "chatbot_id": chatbot_id,
        "filename": filename,
        "extracted_text_preview": text[:1000],  # preview only
        "total_characters": len(text),
    }

@app.post("/documents/chunk")
def chunk_document(
    chatbot_id: str,
    filename: str,
):
    """
    OCR + Chunk a PDF already uploaded to MinIO.
    """

    object_name = f"{chatbot_id}/{filename}"

    # Step 1: OCR
    text = extract_text_from_pdf(
        minio_client=minio_client,
        bucket_name=MINIO_BUCKET,
        object_name=object_name,
    )

    # Step 2: Chunking
    chunks = split_into_chunks(text)

    return {
        "chatbot_id": chatbot_id,
        "filename": filename,
        "total_chunks": len(chunks),
        "chunks_preview": chunks[:3],  # preview first 3 chunks
    }

@app.post("/documents/embed")
def embed_document(
    chatbot_id: str,
    filename: str,
):
    """
    OCR + Chunk + Embed (no Qdrant yet)
    """

    object_name = f"{chatbot_id}/{filename}"

    # OCR
    text = extract_text_from_pdf(
        minio_client=minio_client,
        bucket_name=MINIO_BUCKET,
        object_name=object_name,
    )

    # Chunk
    chunks = split_into_chunks(text)

    # Embed
    embeddings = embed_texts(chunks)

    return {
        "total_chunks": len(chunks),
        "embedding_dim": len(embeddings[0]) if embeddings else 0,
        "example_embedding_preview": embeddings[0][:10] if embeddings else [],
    }

@app.post("/documents/embed")
def embed_document(
    chatbot_id: str,
    filename: str,
):
    """
    OCR + Chunk + Embed using Ollama
    """

    object_name = f"{chatbot_id}/{filename}"

    text = extract_text_from_pdf(
        minio_client=minio_client,
        bucket_name=MINIO_BUCKET,
        object_name=object_name,
    )

    chunks = split_into_chunks(text)
    embeddings = embed_texts(chunks)

    return {
        "total_chunks": len(chunks),
        "embedding_dim": len(embeddings[0]) if embeddings else 0,
        "embedding_preview": embeddings[0][:10] if embeddings else [],
    }

@app.post("/documents/process")
def process_document(
    chatbot_id: str,
    filename: str,
):
    """
    OCR + Chunk + Embed + Store in Qdrant
    """

    object_name = f"{chatbot_id}/{filename}"

    # OCR
    text = extract_text_from_pdf(
        minio_client=minio_client,
        bucket_name=MINIO_BUCKET,
        object_name=object_name,
    )

    # Chunking
    chunks = split_into_chunks(text)

    # Embeddings (Ollama)
    embeddings = embed_texts(chunks)

    # Store in Qdrant
    store_embeddings(
        chatbot_id=chatbot_id,
        embeddings=embeddings,
        chunks=chunks,
        filename=filename,
    )

    return {
        "message": "Document processed and stored in Qdrant",
        "chatbot_id": chatbot_id,
        "filename": filename,
        "total_chunks": len(chunks),
    }

@app.post("/chat/rag")
def rag_chat(
    chatbot_id: str,
    user_message: str,
    chat_history: list[dict] = [],
):
    """
    RAG-based chat response.
    """

    # Embed user question
    query_embedding = embed_texts([user_message])[0]

    # Search relevant chunks
    hits = search_similar_chunks(
        chatbot_id=chatbot_id,
        query_vector=query_embedding,
        limit=5,
    )

    retrieved_texts = [hit["text"] for hit in hits]

    # Build prompt
    prompt = build_prompt(
        retrieved_chunks=retrieved_texts,
        chat_history=chat_history,
        user_question=user_message,
    )

    # Ask LLM
    answer = ask_llm(prompt)

    return {
        "answer": answer,
        "sources": hits,
    }
