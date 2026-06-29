# DeoDap YouTube → Shopify Blog Automation — Quick Start

## Step 0: Prerequisites
- Python 3.11+
- Node.js 20+
- Docker + Docker Compose
- `ffmpeg` (for audio processing)

---

## Step 1: Use the Transcript Tool First (Recommended)

The transcript tool works standalone — no database, no Shopify, no API keys needed
(unless using AssemblyAI fallback).

```bash
cd deodap-yt-blog
pip install yt-dlp faster-whisper

# Transcribe a DeoDap video (CPU mode — accurate but slower)
python transcript_tool.py "https://youtube.com/watch?v=YOUR_VIDEO_ID"

# GPU mode (fast, requires CUDA)
python transcript_tool.py "https://youtube.com/watch?v=YOUR_VIDEO_ID" --gpu

# Use a smaller model for quick testing
python transcript_tool.py "https://youtube.com/watch?v=YOUR_VIDEO_ID" --model base

# Use AssemblyAI cloud (requires ASSEMBLYAI_API_KEY in env)
export ASSEMBLYAI_API_KEY=your_key_here
python transcript_tool.py "https://youtube.com/watch?v=YOUR_VIDEO_ID" --assemblyai
```

Transcripts are saved to `./transcripts/{video_id}.txt` and `.json`.

---

## Step 2: Configure Environment

```bash
cp .env.example .env
# Edit .env and fill in:
#   ANTHROPIC_API_KEY
#   SHOPIFY_STORE_URL
#   SHOPIFY_ADMIN_TOKEN
#   SHOPIFY_BLOG_ID
#   ASSEMBLYAI_API_KEY (optional fallback)
```

---

## Step 3: Run Full Stack with Docker

```bash
docker-compose up --build
```

Then open:
- Dashboard: http://localhost:3000
- API docs:  http://localhost:8000/docs

---

## Step 4: Run Without Docker (Dev Mode)

```bash
# Terminal 1 — Redis
docker run -d -p 6379:6379 redis:7-alpine

# Terminal 2 — PostgreSQL
docker run -d -p 5432:5432 -e POSTGRES_USER=deodap -e POSTGRES_PASSWORD=password -e POSTGRES_DB=yt_blog postgres:15-alpine

# Terminal 3 — Install + Migrate + API
pip install -r requirements.txt
alembic upgrade head
uvicorn backend.main:app --reload --port 8000

# Terminal 4 — Celery Worker
celery -A backend.worker worker --loglevel=info --concurrency=3

# Terminal 5 — Dashboard
cd dashboard && npm install && npm run dev
```

---

## Step 5: Submit a Video

```bash
curl -X POST http://localhost:8000/api/v1/jobs \
  -H "Content-Type: application/json" \
  -d '{"youtube_url": "https://youtube.com/watch?v=YOUR_VIDEO_ID"}'
```

Or use the dashboard at http://localhost:3000.

---

## Transcription Model Guide

| Model     | Speed (CPU) | Hindi Accuracy | RAM Needed | Use When          |
|-----------|-------------|----------------|------------|-------------------|
| base      | Fast (~1x)  | ~80%           | 1 GB       | Quick tests       |
| medium    | Medium      | ~87%           | 3 GB       | Development       |
| large-v3  | Slow (~0.3x)| >92%           | 6 GB       | Production (GPU)  |
| AssemblyAI| Cloud (2min)| ~88%           | N/A        | No GPU available  |

**Production recommendation**: `large-v3` with GPU (NVIDIA RTX 3060+).
**Development**: `base` or `medium` on CPU.

---

## Testing

```bash
pytest tests/ -v --tb=short
```

For offline tests, the sample transcript is at `tests/fixtures/sample_transcript.txt`.
