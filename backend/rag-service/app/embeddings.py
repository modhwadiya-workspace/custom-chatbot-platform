import requests
from typing import List

OLLAMA_URL = "http://ollama:11434"
EMBED_MODEL = "nomic-embed-text"


def embed_texts(texts: List[str]) -> List[List[float]]:
    """
    Generate embeddings using Ollama embedding model.
    CPU-safe, no torch required.
    """
    embeddings = []

    for text in texts:
        response = requests.post(
            f"{OLLAMA_URL}/api/embeddings",
            json={
                "model": EMBED_MODEL,
                "prompt": text,
            },
            timeout=60,
        )

        response.raise_for_status()
        embeddings.append(response.json()["embedding"])

    return embeddings
