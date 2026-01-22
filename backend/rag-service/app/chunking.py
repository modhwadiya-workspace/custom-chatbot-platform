import re
from typing import List


def normalize_text(text: str) -> str:
    """
    Clean OCR text lightly:
    - Normalize whitespace
    - Remove excessive blank lines
    """
    text = text.replace("\r", "\n")
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def split_into_chunks(
    text: str,
    max_chunk_size: int = 800,
    overlap: int = 200,
) -> List[str]:
    """
    Split text into overlapping chunks.
    Strategy:
    1. Split by paragraphs
    2. Combine paragraphs until chunk size reached
    3. Apply overlap between chunks
    """

    text = normalize_text(text)
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]

    chunks = []
    current_chunk = ""

    for para in paragraphs:
        # If adding paragraph exceeds max size, finalize chunk
        if len(current_chunk) + len(para) + 2 > max_chunk_size:
            if current_chunk:
                chunks.append(current_chunk.strip())

                # Create overlap for next chunk
                if overlap > 0 and len(current_chunk) > overlap:
                    current_chunk = current_chunk[-overlap:]
                else:
                    current_chunk = ""

        # Add paragraph to current chunk
        if current_chunk:
            current_chunk += "\n\n" + para
        else:
            current_chunk = para

    # Add final chunk
    if current_chunk.strip():
        chunks.append(current_chunk.strip())

    return chunks
