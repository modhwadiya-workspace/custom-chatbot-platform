from datetime import datetime
import requests
from typing import List

import os

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

OLLAMA_URL = "http://ollama:11434"
CHAT_MODEL = "mistral"


def build_prompt(
    retrieved_chunks: List[str],
    chat_history: List[dict],
    user_question: str,
) -> str:
    context = "\n\n".join(retrieved_chunks)

    history_text = ""
    for msg in chat_history:
        role = msg["role"]
        history_text += f"{role.capitalize()}: {msg['content']}\n"

    prompt = f"""
You are a helpful customer-support chatbot.
Answer ONLY using the provided context.
If the answer is not in the context, say you don't know.

Conversation history:
{history_text}

Context documents:
{context}

User question:
{user_question}

Answer:
""".strip()

    return prompt

def trim_prompt(prompt: str, max_chars: int = 12000) -> str:
    if len(prompt) <= max_chars:
        return prompt
    return prompt[-max_chars:]


def ask_llm(prompt: str) -> str:
    if not GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY is not set")

    trimmed_prompt = trim_prompt(prompt)

    response = requests.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": "llama-3.1-8b-instant",
            "messages": [
                {
                    "role": "system",
                    "content": "You are a helpful assistant. Answer strictly using the provided context.",
                },
                {
                    "role": "user",
                    "content": trimmed_prompt,
                },
            ],
            "temperature": 0.2,
            "max_tokens": 512,   # 🔥 REQUIRED
        },
        timeout=120,
    )

    if response.status_code != 200:
        # 🔥 VERY IMPORTANT FOR DEBUGGING
        raise RuntimeError(
            f"Groq error {response.status_code}: {response.text}"
        )

    data = response.json()
    return data["choices"][0]["message"]["content"]



# def ask_llm(prompt: str) -> str:
#     import datatime
#     start_time = datetime.datetime.now()
#     response = requests.post(
#         f"{OLLAMA_URL}/api/generate",
#         json={
#             "model": CHAT_MODEL,
#             "prompt": prompt,
#             "stream": False,
#         },
#         timeout=300,
#     )
#     end_time = datetime.datetime.now()
#     print(f"LLM response time: {end_time - start_time}")
#     response.raise_for_status()
#     return response.json()["response"]
