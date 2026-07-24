#!/usr/bin/env python3
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import art_generator as ag  # noqa: E402
import requests

headers = {"Authorization": f"Bearer {ag.API_KEY}", "Content-Type": "application/json"}
models = [
    "gpt-4o-mini",
    "gemini-2.0-flash",
    "gemini-2.5-flash",
    "imagen-4.0-ultra-generate-001",
    "dall-e-3",
    "gemini-2.0-flash-preview-image-generation",
    "gemini-3.1-flash-image-preview",
]
print("API_BASE", ag.API_BASE)
for m in models:
    try:
        r = requests.post(
            ag.CHAT_URL,
            headers=headers,
            json={"model": m, "messages": [{"role": "user", "content": "ok"}], "max_tokens": 3},
            timeout=25,
        )
        print(f"chat {m}: {r.status_code} {r.text[:150]}")
    except Exception as e:
        print(f"chat {m}: ERR {e}")

for m in ["imagen-4.0-ultra-generate-001", "gemini-3.1-flash-image-preview", "dall-e-3"]:
    url = f"{ag.API_BASE}/v1beta/models/{m}:generateContent"
    try:
        r = requests.post(
            url,
            headers=headers,
            json={"contents": [{"role": "user", "parts": [{"text": "pixel art icon"}]}]},
            timeout=60,
        )
        print(f"gemini {m}: {r.status_code} {r.text[:150]}")
    except Exception as e:
        print(f"gemini {m}: ERR {e}")

img_models = [
    "dall-e-3",
    "dall-e-2",
    "gpt-image-1",
    "imagen-4.0-ultra-generate-001",
    "gemini-3.1-flash-image-preview",
    "flux-1-schnell",
    "flux-dev",
]
for m in img_models:
    try:
        r = requests.post(
            f"{ag.API_BASE}/v1/images/generations",
            headers=headers,
            json={"model": m, "prompt": "pixel art sword icon black background", "n": 1, "size": "1024x1024"},
            timeout=90,
        )
        print(f"openai-img {m}: {r.status_code} {r.text[:180]}")
    except Exception as e:
        print(f"openai-img {m}: ERR {e}")
