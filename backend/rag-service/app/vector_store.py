from qdrant_client import QdrantClient
from qdrant_client.models import VectorParams, Distance
from typing import List

QDRANT_URL = "http://qdrant:6333"
COLLECTION_PREFIX = "chatbot_"


def get_collection_name(chatbot_id: str) -> str:
    return f"{COLLECTION_PREFIX}{chatbot_id}"


def get_qdrant_client() -> QdrantClient:
    return QdrantClient(url=QDRANT_URL)


def ensure_collection(client: QdrantClient, collection_name: str, vector_size: int):
    collections = client.get_collections().collections
    if not any(c.name == collection_name for c in collections):
        client.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(
                size=vector_size,
                distance=Distance.COSINE,
            ),
        )


def store_embeddings(
    chatbot_id: str,
    embeddings: List[List[float]],
    chunks: List[str],
    filename: str,
):
    client = get_qdrant_client()
    collection_name = get_collection_name(chatbot_id)

    ensure_collection(client, collection_name, len(embeddings[0]))

    points = []
    for idx, (vector, text) in enumerate(zip(embeddings, chunks)):
        points.append(
            {
                "id": idx,
                "vector": vector,
                "payload": {
                    "chatbot_id": chatbot_id,
                    "filename": filename,
                    "text": text,
                },
            }
        )

    client.upsert(collection_name=collection_name, points=points)


def search_similar_chunks(
    chatbot_id: str,
    query_vector: List[float],
    limit: int = 5,
):
    client = get_qdrant_client()
    collection_name = get_collection_name(chatbot_id)

    results = client.search(
        collection_name=collection_name,
        query_vector=query_vector,
        limit=limit,
    )

    return [
        {
            "text": hit.payload["text"],
            "score": hit.score,
            "filename": hit.payload.get("filename"),
        }
        for hit in results
    ]

