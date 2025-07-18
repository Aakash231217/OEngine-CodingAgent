# Gitosys Background Worker

This worker processes AI fix generation jobs in the background to avoid Vercel's 60-second timeout limit.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Environment variables:**
   ```bash
   cp .env.example .env
   # Fill in your values in .env
   ```

3. **Run locally:**
   ```bash
   npm run dev
   ```

## Deployment to Render

1. **Push this worker directory to GitHub**
2. **Create new Worker Service on Render**
3. **Connect to your GitHub repo**
4. **Set environment variables in Render dashboard:**
   - `DATABASE_URL`: Your Vercel Postgres connection string
   - `REDIS_URL`: Your Upstash Redis connection string
   - `OPENAI_API_KEY`: Your OpenAI API key
   - `GEMINI_API_KEY`: Your Gemini API key

## How it works

1. Main app creates job and adds to Redis queue
2. This worker picks up jobs from Redis queue
3. Worker processes AI fix generation (can take 5-15 minutes)
4. Results are saved to database
5. Main app polls database for results

## Monitoring

Check worker logs in Render dashboard to monitor job processing.
