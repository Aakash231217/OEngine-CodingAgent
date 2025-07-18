# Gitosys Worker - Open Source AI Code Analysis Engine

A powerful background worker for AI-powered code analysis, bug fixing, and repository understanding.

## Features

- 🤖 **AI-Powered Analysis**: Uses OpenAI and Claude models for intelligent code analysis
- 🔍 **Vector Embeddings**: Semantic search using PostgreSQL pgvector
- 🚀 **Scalable Processing**: Redis-based job queue for background processing
- 📊 **Repository Context**: Understands project structure and patterns
- 🛠️ **Code Generation**: Intelligent file creation and modification
- 🐛 **Bug Fixing**: Automated issue detection and resolution

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL with pgvector extension
- Redis server
- OpenAI API key
- Anthropic API key (optional)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/gitosys-worker.git
cd gitosys-worker

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Set up database
npx prisma generate
npx prisma db push

# Start the worker
npm start
```

### Environment Variables

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/gitosys_worker"

# Redis
REDIS_URL="redis://localhost:6379"

# AI APIs
OPENAI_API_KEY="your-openai-key"
ANTHROPIC_API_KEY="your-anthropic-key"

# Optional
PORT=3001
NODE_ENV=production
```

## Database Schema

The worker uses a minimal schema focused on core functionality:

- **Project**: Repository metadata
- **SourceCodeEmbedding**: Vector embeddings for semantic search
- **FixJob**: Background job processing
- **Question**: Q&A history

## Usage

### Adding a Job

```javascript
// Add to Redis queue
await redis.lpush('fix-jobs', JSON.stringify({
  jobId: 'job-123',
  question: 'Fix the authentication bug',
  summary: 'Users cannot login',
  projectId: 'project-456'
}));
```

### Processing Results

```javascript
// Check job status
const job = await prisma.fixJob.findUnique({
  where: { id: 'job-123' }
});

console.log(job.status); // PENDING, PROCESSING, COMPLETED, FAILED
console.log(job.result); // AI-generated fixes
```

## API Reference

### Core Functions

- `processFixJob(jobData, prisma)` - Process a bug fix job
- `generateEmbedding(text)` - Generate vector embeddings
- `getRepositoryContext(projectId)` - Get project context
- `analyzeFeatureRequest(question, summary, projectId)` - Analyze and plan features

## Docker Support

```dockerfile
# Dockerfile included for easy deployment
docker build -t gitosys-worker .
docker run -p 3001:3001 gitosys-worker
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT License - see LICENSE file for details

## Support

- 📚 [Documentation](https://docs.gitosys.com)
- 💬 [Community Discord](https://discord.gg/gitosys)
- 🐛 [Issue Tracker](https://github.com/yourusername/gitosys-worker/issues)

## Enterprise

For enterprise features including:
- Advanced AI models
- Priority processing
- Custom integrations
- Professional support

Visit [gitosys.com](https://gitosys.com) for managed hosting and enterprise solutions.
