require('dotenv').config();
const http = require('http');
const { Redis } = require('ioredis');
const { PrismaClient } = require('@prisma/client');
const { processFixJob } = require('./lib/ai');

// Validate environment variables
if (!process.env.REDIS_URL) {
  console.error('❌ REDIS_URL environment variable is required');
  process.exit(1);
}

if (!process.env.OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY environment variable is required (for embeddings)');
  process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY environment variable is required (for Claude code fixes)');
  process.exit(1);
}

const redis = new Redis(process.env.REDIS_URL);
const db = new PrismaClient();

// Health check server for Render
const PORT = process.env.PORT || 3001;
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'healthy', 
      worker: 'gitosys-background-worker',
      timestamp: new Date().toISOString(),
      redis: redis.status === 'ready' ? 'connected' : 'disconnected'
    }));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`🌐 Health check server running on port ${PORT}`);
});

async function startWorker() {
  console.log('🚀 Gitosys Worker starting...');
  console.log(`📊 Worker PID: ${process.pid}`);
  console.log(`🔗 Redis connected: ${!!redis.status}`);
  
  // Test database connection
  try {
    await db.$connect();
    console.log('✅ Database connected');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }

  while (true) {
    try {
      console.log('⏳ Waiting for jobs...');
      
      // Check for fix jobs
      const result = await redis.blpop('fix-jobs', 30); // Wait 30 seconds for a job
      
      if (result) {
        const jobData = JSON.parse(result[1]);
        console.log(`🔧 Processing fix job: ${jobData.jobId}`);
        
        // Update job status to processing
        await db.fixJob.update({
          where: { id: jobData.jobId },
          data: { 
            status: 'PROCESSING',
            updatedAt: new Date()
          }
        });
        
        await processFixJob(jobData, db);
        console.log(`✅ Completed fix job: ${jobData.jobId}`);
      } else {
        console.log('💤 No jobs in queue, continuing...');
      }
      
    } catch (error) {
      console.error('❌ Worker error:', error);
      
      // Wait 5 seconds before retrying on error
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down worker...');
  server.close();
  await redis.disconnect();
  await db.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down worker...');
  server.close();
  await redis.disconnect();
  await db.$disconnect();
  process.exit(0);
});

startWorker().catch(error => {
  console.error(' Worker failed to start:', error);
  process.exit(1);
});