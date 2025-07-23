//use it wisely
const { anthropic } = require('@ai-sdk/anthropic');
const { generateText } = require('ai');

// OpenAI client for embeddings (keeping this for embeddings)
const { OpenAI } = require('openai');
const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// GitHub API client for fetching repository files
const { Octokit } = require('@octokit/rest');

// Claude client configuration
const claudeModel = anthropic('claude-sonnet-4-20250514');

/**
 * Generate embedding for text
 * @param {string} text - Text to generate embedding for
 * @returns {Promise<number[]>} Embedding vector
 */
// @ts-ignore
// @ts-ignore
async function generateEmbedding(text) {
  try {
    const response = await openaiClient.embeddings.create({
      model: 'text-embedding-3-large',
      input: text,
    });

    if (response.data && response.data[0] && response.data[0].embedding) {
      return response.data[0].embedding;
    } else {
      throw new Error('Invalid embedding response structure');
    }
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

/**
 * @typedef {Object} FileReference
 * @property {string} fileName - The name of the file
 * @property {string} sourceCode - The source code content
 * @property {string} summary - Summary of the file
 * @property {number} similarity - Similarity score
 */

/**
 * @typedef {Object} JobData
 * @property {string} jobId - The unique job identifier
 * @property {string} projectId - The project identifier
 * @property {string} question - The user's question/issue
 * @property {string} summary - Summary of the issue
 * @property {FileReference[]} files - Array of relevant files
 */

/**
 * @typedef {Object} Database
 * @property {Object} fixJob - Prisma FixJob model
 * @property {Function} fixJob.update - Update fix job function
 * @property {Function} fixJob.findUnique - Find unique fix job function
 */

/**
 * @typedef {Object} FixResult
 * @property {boolean} needsFix - Whether the file needs fixing
 * @property {string|null} fixedCode - The corrected code or null if no fix needed
 * @property {string} explanation - Detailed explanation of the fix
 * @property {string[]} changes - Array of specific changes made
 * @property {Array<{lineNumber: number, action: string, originalLine: string, newLine?: string}>} lineChanges - Array of line-level changes
 */

/**
 * Calculate priority score for a file based on its characteristics and issue context
 * @param {FileReference} file - File object with fileName, sourceCode, summary, similarity
 * @param {string} issueDescription - The issue description to match against
 * @returns {number} Priority score (higher = more important)
 */
function calculateFilePriority(file, issueDescription) {
  let score = file.similarity || 0; // Base vector similarity score
  
  // Check if fileName exists, return base score if not
  if (!file.fileName) {
    return score;
  }
  
  const filePath = file.fileName.toLowerCase();
  const issueText = issueDescription.toLowerCase();
  
  // =========================
  // GENERATED FILES DETECTION (All Languages)
  // =========================
  
  // Database Generated Files
  if (filePath.includes('migrations/') || filePath.includes('_migrations/') ||
      filePath.includes('schema.rb') || filePath.includes('schema.sql') ||
      filePath.includes('_gen.go') || filePath.includes('_generated.go') ||
      filePath.includes('models_gen.py') || filePath.includes('_pb2.py') ||
      filePath.includes('prisma/migrations/') || filePath.includes('sequelize/migrations/') ||
      filePath.includes('knex/migrations/') || filePath.includes('typeorm/migration/') ||
      filePath.includes('alembic/versions/') || filePath.includes('flyway/sql/')) {
    score -= 0.4; // Database migrations are auto-generated
  }
  
  // Language-Specific Generated Files
  if (filePath.includes('_generated/') || filePath.endsWith('.d.ts') ||
      filePath.endsWith('_pb.py') || filePath.endsWith('_pb2.py') || // Python protobuf
      filePath.endsWith('.pb.go') || filePath.endsWith('_gen.go') || // Go protobuf/generated
      filePath.endsWith('_generated.rs') || filePath.endsWith('.rs.in') || // Rust generated
      filePath.includes('target/debug/') || filePath.includes('target/release/') || // Rust build output
      filePath.includes('__pycache__/') || filePath.endsWith('.pyc') || // Python compiled
      filePath.includes('node_modules/') || filePath.includes('.next/') || // JS build artifacts
      filePath.includes('dist/') || filePath.includes('build/') ||
      filePath.includes('cmake-build-') || filePath.endsWith('.o') || filePath.endsWith('.so') || // C++ build
      filePath.includes('vendor/') && filePath.includes('.go')) { // Go vendor
    score -= 0.3; // Generated/compiled files are less likely to need fixes
  }
  
  // =========================
  // CONFIGURATION FILES (All Languages)
  // =========================
  
  // Documentation Files (Should have lower priority for code fixes)
  if (filePath.endsWith('readme.md') || filePath.endsWith('readme.txt') ||
      filePath.endsWith('changelog.md') || filePath.endsWith('changelog.txt') ||
      filePath.endsWith('license') || filePath.endsWith('license.md') ||
      filePath.endsWith('contributing.md') || filePath.endsWith('authors.md') ||
      filePath.endsWith('.md') && (filePath.includes('docs/') || filePath.includes('documentation/')) ||
      filePath.endsWith('todo.md') || filePath.endsWith('notes.md')) {
    score -= 0.3; // Documentation files are less likely to need code fixes
  }
  
  // JavaScript/Node.js Config
  if (filePath.endsWith('package.json') || filePath.endsWith('package-lock.json') ||
      filePath.endsWith('yarn.lock') || filePath.endsWith('pnpm-lock.yaml') ||
      filePath.endsWith('tsconfig.json') || filePath.endsWith('.eslintrc.js') ||
      filePath.endsWith('webpack.config.js') || filePath.endsWith('vite.config.js') ||
      filePath.endsWith('next.config.js') || filePath.endsWith('tailwind.config.js')) {
    score -= 0.2; // JS config files rarely need fixes
  }
  
  // Python Config
  if (filePath.endsWith('requirements.txt') || filePath.endsWith('pyproject.toml') ||
      filePath.endsWith('setup.py') || filePath.endsWith('setup.cfg') ||
      filePath.endsWith('pipfile') || filePath.endsWith('pipfile.lock') ||
      filePath.endsWith('poetry.lock') || filePath.endsWith('conda.yaml')) {
    score -= 0.2; // Python config files rarely need fixes
  }
  
  // Go Config
  if (filePath.endsWith('go.mod') || filePath.endsWith('go.sum') ||
      filePath.endsWith('go.work') || filePath.endsWith('go.work.sum')) {
    score -= 0.2; // Go module files rarely need fixes
  }
  
  // Rust Config
  if (filePath.endsWith('cargo.toml') || filePath.endsWith('cargo.lock')) {
    score -= 0.2; // Rust config files rarely need fixes
  }
  
  // C++ Config
  if (filePath.endsWith('cmakelists.txt') || filePath.endsWith('makefile') ||
      filePath.endsWith('.cmake') || filePath.endsWith('conanfile.txt') ||
      filePath.endsWith('vcpkg.json')) {
    score -= 0.2; // C++ build config files rarely need fixes
  }
  
  // =========================
  // TEST FILES (All Languages)
  // =========================
  
  if (filePath.includes('.test.') || filePath.includes('.spec.') ||
      filePath.includes('__tests__/') || filePath.includes('/tests/') ||
      filePath.includes('/test/') || filePath.includes('_test.go') ||
      filePath.includes('_test.py') || filePath.endsWith('_test.rs') ||
      filePath.includes('test_') || filePath.endsWith('_unittest.cpp') ||
      filePath.includes('spec/') || filePath.includes('testing/')) {
    score -= 0.1; // Test files are less likely to contain the main issue
  }
  
  // =========================
  // HIGH-PRIORITY MAIN FILES (Multi-Language)
  // =========================
  
  // JavaScript/Node.js/React Main Files
  if (filePath.includes('page.tsx') || filePath.includes('index.tsx') ||
      filePath.includes('layout.tsx') || filePath.includes('app.tsx') ||
      filePath.includes('main.js') || filePath.includes('index.js') ||
      filePath.includes('server.js') || filePath.includes('app.js')) {
    score += 0.2; // Main app files are high priority
  }
  
  // Python Main Files
  if (filePath.endsWith('main.py') || filePath.endsWith('__init__.py') ||
      filePath.endsWith('app.py') || filePath.endsWith('server.py') ||
      filePath.endsWith('manage.py') || filePath.includes('wsgi.py') ||
      filePath.includes('asgi.py')) {
    score += 0.2; // Python main files are high priority
  }
  
  // Go Main Files
  if (filePath.endsWith('main.go') || filePath.endsWith('server.go') ||
      filePath.endsWith('app.go') || filePath.endsWith('cmd.go')) {
    score += 0.2; // Go main files are high priority
  }
  
  // Rust Main Files
  if (filePath.endsWith('main.rs') || filePath.endsWith('lib.rs') ||
      filePath.endsWith('mod.rs')) {
    score += 0.2; // Rust main files are high priority
  }
  
  // C++ Main Files
  if (filePath.endsWith('main.cpp') || filePath.endsWith('main.cc') ||
      filePath.endsWith('main.c') || filePath.endsWith('app.cpp')) {
    score += 0.2; // C++ main files are high priority
  }
  
  // =========================
  // COMPONENT/MODULE FILES (Language-Specific)
  // =========================
  
  // React/Frontend Components
  if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx') ||
      filePath.includes('/components/') || filePath.includes('/ui/')) {
    score += 0.1; // React components are likely to need fixes
  }
  
  // Python Modules
  if (filePath.endsWith('.py') && !filePath.includes('test') &&
      (filePath.includes('/models/') || filePath.includes('/views/') ||
       filePath.includes('/controllers/') || filePath.includes('/services/'))) {
    score += 0.1; // Python business logic files
  }
  
  // Go Packages
  if (filePath.endsWith('.go') && !filePath.includes('test') &&
      (filePath.includes('/pkg/') || filePath.includes('/internal/') ||
       filePath.includes('/cmd/') || filePath.includes('/api/'))) {
    score += 0.1; // Go package files
  }
  
  // =========================
  // API/SERVER FILES (Multi-Language)
  // =========================
  
  // JavaScript/Node.js API
  if (filePath.includes('/api/') || filePath.includes('route.ts') ||
      filePath.includes('server.ts') || filePath.includes('middleware.ts') ||
      filePath.includes('handler.js') || filePath.includes('controller.js')) {
    score += 0.15; // API/Server files are important
  }
  
  // Python API
  if (filePath.includes('views.py') || filePath.includes('urls.py') ||
      filePath.includes('api.py') || filePath.includes('routes.py') ||
      filePath.includes('handlers.py') || filePath.includes('endpoints.py')) {
    score += 0.15; // Python API files are important
  }
  
  // Go API
  if (filePath.includes('handler.go') || filePath.includes('router.go') ||
      filePath.includes('controller.go') || filePath.includes('middleware.go') ||
      filePath.includes('/api/') || filePath.includes('/handlers/')) {
    score += 0.15; // Go API files are important
  }
  
  // Rust Web
  if (filePath.includes('handler.rs') || filePath.includes('router.rs') ||
      filePath.includes('controller.rs') || filePath.includes('/api/')) {
    score += 0.15; // Rust web files are important
  }
  
  // Issue Context Modifiers
  const fileName = file.fileName.split('/').pop();
  if (fileName && issueText.includes(fileName.toLowerCase())) {
    score += 0.3; // File name mentioned in issue
  }
  
  // Extract potential component/function names from issue
  const componentMatches = issueDescription.match(/[A-Z][a-zA-Z]+/g) || [];
  const functionMatches = issueDescription.match(/\b[a-z][a-zA-Z]+\(/g) || [];
  
  for (const match of [...componentMatches, ...functionMatches]) {
    const cleanMatch = match.replace('(', '').toLowerCase();
    if (filePath.includes(cleanMatch) || file.summary?.toLowerCase().includes(cleanMatch)) {
      score += 0.2; // Component/function mentioned in issue
    }
  }
  
  // =========================
  // DIRECTORY CONTEXT MATCHING (Multi-Language)
  // =========================
  
  // Frontend/UI Context
  if ((issueText.includes('component') || issueText.includes('ui') || issueText.includes('frontend')) &&
      (filePath.includes('/components/') || filePath.includes('/ui/') || filePath.includes('/widgets/'))) {
    score += 0.1;
  }
  
  // API/Backend Context
  if ((issueText.includes('api') || issueText.includes('endpoint') || issueText.includes('server') || issueText.includes('backend')) &&
      (filePath.includes('/api/') || filePath.includes('/handlers/') || filePath.includes('/controllers/') ||
       filePath.includes('/routes/') || filePath.includes('/endpoints/') || filePath.includes('/views/'))) {
    score += 0.1;
  }
  
  // Database/Model Context
  if ((issueText.includes('database') || issueText.includes('model') || issueText.includes('schema') || issueText.includes('query')) &&
      (filePath.includes('/models/') || filePath.includes('/schemas/') || filePath.includes('/db/') ||
       filePath.includes('/database/') || filePath.includes('/entities/') || filePath.includes('/repository/'))) {
    score += 0.1;
  }
  
  // Service/Business Logic Context
  if ((issueText.includes('service') || issueText.includes('business') || issueText.includes('logic') || issueText.includes('utility')) &&
      (filePath.includes('/services/') || filePath.includes('/utils/') || filePath.includes('/helpers/') ||
       filePath.includes('/lib/') || filePath.includes('/core/') || filePath.includes('/pkg/'))) {
    score += 0.1;
  }
  
  // Authentication/Security Context
  if ((issueText.includes('auth') || issueText.includes('login') || issueText.includes('security') || issueText.includes('jwt')) &&
      (filePath.includes('/auth/') || filePath.includes('/security/') || filePath.includes('/middleware/') ||
       filePath.includes('auth.') || filePath.includes('jwt.') || filePath.includes('login.'))) {
    score += 0.15; // Auth issues are often critical
  }
  
  // Configuration/Settings Context
  if ((issueText.includes('config') || issueText.includes('setting') || issueText.includes('environment')) &&
      (filePath.includes('/config/') || filePath.includes('/settings/') || filePath.includes('/env/') ||
       filePath.includes('.config.') || filePath.includes('.env'))) {
    score += 0.05; // Config files get slight boost if mentioned
  }
  
  // Testing Context (but lower priority)
  if ((issueText.includes('test') || issueText.includes('testing') || issueText.includes('spec')) &&
      (filePath.includes('/test/') || filePath.includes('/tests/') || filePath.includes('/__tests__/') ||
       filePath.includes('.test.') || filePath.includes('.spec.'))) {
    score += 0.05; // Test files get slight boost if test-related issue
  }
  
  // Language-Specific Patterns
  // Python Django/Flask patterns
  if (issueText.includes('django') || issueText.includes('flask')) {
    if (filePath.includes('views.py') || filePath.includes('urls.py') || filePath.includes('models.py')) {
      score += 0.1;
    }
  }
  
  // Go patterns
  if (issueText.includes('goroutine') || issueText.includes('channel') || issueText.includes('go func')) {
    if (filePath.endsWith('.go')) {
      score += 0.1;
    }
  }
  
  // Rust patterns
  if (issueText.includes('cargo') || issueText.includes('crate') || issueText.includes('rust')) {
    if (filePath.endsWith('.rs')) {
      score += 0.1;
    }
  }
  
  // C++ patterns
  if (issueText.includes('cmake') || issueText.includes('makefile') || issueText.includes('gcc') || issueText.includes('clang')) {
    if (filePath.endsWith('.cpp') || filePath.endsWith('.cc') || filePath.endsWith('.c') || filePath.endsWith('.h') || filePath.endsWith('.hpp')) {
      score += 0.1;
    }
  }
  
  return Math.max(0, score); // Ensure non-negative score
}

/**
 * Determine smart file limit based on issue complexity
 * @param {string} issueDescription - The issue description
 * @returns {number} Number of files to process
 */
function getSmartFileLimit(issueDescription) {
  const complexity = issueDescription.length;
  
  if (complexity < 100) return 3; // Simple issues
  if (complexity < 300) return 4; // Medium complexity
  return 5; // Complex issues
}

/**
 * Prioritize files based on relevance to the issue
 * @param {FileReference[]} files - Array of file objects
 * @param {string} issueDescription - The issue description
 * @returns {FileReference[]} Sorted array of prioritized files
 */
function prioritizeFiles(files, issueDescription) {
  console.log(`🎯 Prioritizing ${files.length} files based on issue context...`);
  
  const prioritizedFiles = files.map(file => ({
    ...file,
    priorityScore: calculateFilePriority(file, issueDescription)
  }));
  
  // Sort by priority score (highest first)
  prioritizedFiles.sort((a, b) => b.priorityScore - a.priorityScore);
  
  // Log prioritization results
  console.log('📊 File priorities:');
  prioritizedFiles.forEach((file, index) => {
    const indicator = index < 3 ? '✅' : '⏸️';
    console.log(`${indicator} ${file.fileName} (score: ${file.priorityScore.toFixed(3)})`);
  });
  
  return prioritizedFiles;
}

/**
 * Process a fix job by generating AI-powered code fixes or creating new files
 * @param {JobData} jobData - The job data containing files and context
 * @param {Database} db - Prisma database connection
 */
async function processFixJob(jobData, db) {
  // @ts-ignore
  const { jobId, question, summary, files, jobType, isCreateMode } = jobData;
  
  try {
    console.log(`🔧 Processing job ${jobId} with type ${jobType}${isCreateMode ? ' (CREATE MODE)' : ''}`);
    
    // Check if this is a file creation request
    if (jobType === 'FILE_CREATION' || isCreateMode) {
      return await processFileCreationJob(jobData, db);
    }
    
    // Original fix job logic
    console.log(`🔧 Processing ${files.length} files for fix job ${jobId}`);
    
    // NEW: Prioritize files based on issue context
    const prioritizedFiles = prioritizeFiles(files, question);
    
    // NEW: Smart file limit based on issue complexity
    const smartLimit = getSmartFileLimit(question);
    const filesToProcess = prioritizedFiles.slice(0, smartLimit);
    
    console.log(`🎯 Processing top ${filesToProcess.length} prioritized files (smart limit: ${smartLimit})`);
    
    const codeFixes = [];
    let processedFiles = 0;
    
    for (const file of filesToProcess) {
      try {
        console.log(`📁 Processing file: ${file.fileName}`);
        
        // Update progress
        await db.fixJob.update({
          where: { id: jobId },
          data: { 
            progress: Math.round((processedFiles / filesToProcess.length) * 100),
            currentFile: file.fileName
          }
        });
        
        // Generate fix for this file
        const fix = await generateFileFix(file, question, summary);
        
        if (fix && fix.needsFix) {
          codeFixes.push({
            fileName: file.fileName,
            originalCode: file.sourceCode,
            fixedCode: fix.fixedCode,
            summary: file.summary,
            explanation: fix.explanation,
            changes: fix.changes || [],
            lineChanges: fix.lineChanges || []
          });
          
          console.log(`✅ Generated fix for: ${file.fileName}`);
        } else {
          console.log(`ℹ️  No fix needed for: ${file.fileName}`);
        }
        
        processedFiles++;
        
      } catch (fileError) {
        console.error(`❌ Error processing file ${file.fileName}:`, fileError);
        // Continue with other files even if one fails
      }
    }
    
    // Save final results
    await db.fixJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        progress: 100,
        result: { fixes: codeFixes },
        completedAt: new Date()
      }
    });
    
    console.log(`🎉 Job ${jobId} completed with ${codeFixes.length} fixes`);
    
  } catch (error) {
    console.error(`💥 Job ${jobId} failed:`, error);
    
    // Mark job as failed
    await db.fixJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        // @ts-ignore
        error: error.message,
        updatedAt: new Date()
      }
    });
  }
}

/**
 * Generate AI-powered fix for a specific file
 * @param {FileReference} file - The file to analyze and fix
 * @param {string} question - The user's question/issue
 * @param {string} summary - Summary of the issue
 * @returns {Promise<FixResult>} Fix result with needsFix, fixedCode, explanation, and changes
 */
async function generateFileFix(file, question, summary) {
  const enhancedContext = summary 
    ? `Issue Context: ${summary}\n\nOriginal Question: ${question}`
    : question;

  // Add line numbers to help AI identify specific lines to fix
  const lines = file.sourceCode.split('\n');
  const numberedCode = lines.map((line, index) => `${index + 1}: ${line}`).join('\n');
  
  // Claude 3.5 Sonnet can handle 200K input tokens - let's use much more
  const maxCodeLength = 50000; // Increased dramatically - Claude can handle it
  const truncatedCode = numberedCode.length > maxCodeLength 
    ? numberedCode.substring(0, maxCodeLength) + '\n// ... (code truncated for analysis)'
    : numberedCode;

  const fixPrompt = `You are an expert senior software engineer analyzing code to fix issues.

Context: ${enhancedContext}

File: ${file.fileName}
Summary: ${file.summary}

Code with line numbers:
\`\`\`
${truncatedCode}
\`\`\`

Analyze this code and determine if it needs to be fixed based on the SPECIFIC issue mentioned in the context. Focus ONLY on the exact problem described.

Instead of rewriting entire file, identify the specific lines that need changes.

CRITICAL: You must respond with ONLY a valid JSON object. No markdown formatting, no explanations, no text outside the JSON object.

Respond with valid JSON in this exact format:
{
  "needsFix": boolean,
  "lineChanges": [
    {
      "lineNumber": number,
      "action": "remove" | "replace" | "add",
      "originalLine": "original line content",
      "newLine": "new line content (if action is replace or add)"
    }
  ],
  "explanation": "specific explanation of the exact issue and minimal fix applied",
  "changes": ["array of specific changes made"]
}

IMPORTANT RULES:
- Make ONLY the minimal line changes needed to fix the SPECIFIC issue mentioned
- DO NOT make any other improvements, optimizations, or style changes
- If the issue is "X is defined but never used" - ONLY remove the unused import/variable line
- If the issue is a type error - ONLY fix the specific type on that line
- If the issue is a syntax error - ONLY fix the specific syntax on that line
- DO NOT refactor, reorganize, or improve code beyond the specific issue
- Use line numbers to specify exactly which lines to change
- For remove action: just specify lineNumber and originalLine
- For replace action: specify lineNumber, originalLine, and newLine
- For add action: specify lineNumber (to add after), and newLine
- If no fix is needed for the specific issue, set needsFix to false
- The response must be parseable JSON - no markdown blocks or extra text`;

  try {
    console.log(`🔧 Generating fix for ${file.fileName} using Claude Sonnet 4...`);
    
    const response = await generateText({
      model: claudeModel,
      prompt: fixPrompt,
      temperature: 0.1,
      maxTokens: 40000 // Claude 3.5 Sonnet's actual limit
    });

    console.log(`📄 Claude response length: ${response.text.length} chars for ${file.fileName}`);
    
    // Clean and extract JSON from response with robust error handling
    const cleanedResponse = response.text.trim();
    
    // Try multiple JSON extraction strategies
    let fixData = null;
    
    // Strategy 1: Direct JSON match
    const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        fixData = JSON.parse(jsonMatch[0]);
        console.log(`✅ Successfully parsed JSON for ${file.fileName}`);
      } catch (parseError) {
        // @ts-ignore
        console.warn(`⚠️ Failed to parse extracted JSON for ${file.fileName}:`, parseError.message);
        
        // Strategy 2: Try to repair truncated JSON
        const truncatedJson = jsonMatch[0];
        const repairedJson = repairTruncatedJson(truncatedJson);
        
        try {
          fixData = JSON.parse(repairedJson);
          console.log(`🔧 Successfully parsed repaired JSON for ${file.fileName}`);
        } catch (repairError) {
          // @ts-ignore
          console.warn(`⚠️ Failed to parse repaired JSON for ${file.fileName}:`, repairError.message);
          
          // Strategy 3: Extract partial data using regex
          fixData = extractPartialFixData(cleanedResponse);
          console.log(`🔍 Using partial data extraction for ${file.fileName}`);
        }
      }
    }
    
    // If all strategies failed, return no fix needed
    if (!fixData) {
      console.log(`❌ No valid JSON found for ${file.fileName}, skipping`);
      return { 
        needsFix: false, 
        fixedCode: null,
        explanation: 'Could not parse AI response - file may not need fixes',
        changes: [],
        lineChanges: []
      };
    }
    
    // Validate and sanitize response structure
    const sanitizedFix = {
      needsFix: Boolean(fixData.needsFix),
      fixedCode: /** @type {string | null} */ (null), // Will be generated from line changes
      explanation: String(fixData.explanation || 'No explanation provided'),
      changes: Array.isArray(fixData.changes) ? fixData.changes : [],
      lineChanges: Array.isArray(fixData.lineChanges) ? fixData.lineChanges : []
    };

    // If fixes are needed, apply line changes to generate complete fixed code
    if (sanitizedFix.needsFix && sanitizedFix.lineChanges.length > 0) {
      try {
        const originalLines = file.sourceCode.split('\n');
        const fixedLines = [...originalLines]; // Copy original lines
        
        // Sort line changes by line number (descending) to avoid index shifting issues
        // @ts-ignore
        const sortedChanges = sanitizedFix.lineChanges.sort((a, b) => b.lineNumber - a.lineNumber);
        
        // Apply each line change
        for (const change of sortedChanges) {
          const lineIndex = change.lineNumber - 1; // Convert to 0-based index
          
          if (change.action === 'remove') {
            if (lineIndex >= 0 && lineIndex < fixedLines.length) {
              fixedLines.splice(lineIndex, 1);
              console.log(`🗑️ Removed line ${change.lineNumber}: ${change.originalLine}`);
            }
          } else if (change.action === 'replace') {
            if (lineIndex >= 0 && lineIndex < fixedLines.length) {
              fixedLines[lineIndex] = change.newLine;
              console.log(`🔄 Replaced line ${change.lineNumber}`);
            }
          } else if (change.action === 'add') {
            if (lineIndex >= 0 && lineIndex <= fixedLines.length) {
              fixedLines.splice(lineIndex + 1, 0, change.newLine);
              console.log(`➕ Added line after ${change.lineNumber}`);
            }
          }
        }
        
        sanitizedFix.fixedCode = fixedLines.join('\n');
        console.log(`✅ Successfully applied ${sortedChanges.length} line changes for ${file.fileName}`);
        
      } catch (applyError) {
        console.error(`❌ Failed to apply line changes for ${file.fileName}:`, applyError);
        sanitizedFix.needsFix = false;
        sanitizedFix.fixedCode = null;
        // @ts-ignore
        sanitizedFix.explanation += ` (Error applying changes: ${applyError.message})`;
      }
    }

    return sanitizedFix;
  } catch (error) {
    // @ts-ignore
    console.error(`Failed to generate fix for ${file.fileName}:`, error);
    return { 
      needsFix: false, 
      fixedCode: null,
      // @ts-ignore
      explanation: `Error generating fix: ${error.message}`,
      changes: [],
      lineChanges: []
    };
  }
}

// Helper function to repair truncated JSON
/**
 * @param {string} jsonString
 */
function repairTruncatedJson(jsonString) {
  try {
    // Remove incomplete strings at the end
    let repaired = jsonString;
    
    // Count opening and closing braces/brackets
    let braceCount = 0;
    let bracketCount = 0;
    let inString = false;
    let escaped = false;
    
    for (let i = 0; i < repaired.length; i++) {
      const char = repaired[i];
      
      if (escaped) {
        escaped = false;
        continue;
      }
      
      if (char === '\\') {
        escaped = true;
        continue;
      }
      
      if (char === '"') {
        inString = !inString;
        continue;
      }
      
      if (!inString) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
        if (char === '[') bracketCount++;
        if (char === ']') bracketCount--;
      }
    }
    
    // If we're in the middle of a string, close it
    if (inString) {
      repaired += '"';
    }
    
    // Add missing closing brackets and braces
    for (let i = 0; i < bracketCount; i++) {
      repaired += ']';
    }
    for (let i = 0; i < braceCount; i++) {
      repaired += '}';
    }
    
    return repaired;
  } catch (error) {
    console.warn('Failed to repair JSON:', error instanceof Error ? error.message : String(error));
    return jsonString;
  }
}

// Helper function to extract partial data using regex
/**
 * @param {string} responseText
 */
function extractPartialFixData(responseText) {
  try {
    const extractedData = {
      needsFix: false,
      fixedCode: null,
      explanation: 'Partial data extraction used due to malformed JSON',
      changes: []
    };
    
    // Try to extract needsFix
    const needsFixMatch = responseText.match(/"needsFix":\s*(true|false)/i);
    if (needsFixMatch) {
      // @ts-ignore
      extractedData.needsFix = needsFixMatch[1].toLowerCase() === 'true';
    }
    
    // Try to extract explanation
    const explanationMatch = responseText.match(/"explanation":\s*"([^"]*(?:\\.[^"]*)*)"/);
    if (explanationMatch) {
      // @ts-ignore
      extractedData.explanation = explanationMatch[1].replace(/\\"/g, '"');
    }
    
    // Try to extract changes array
    const changesMatch = responseText.match(/"changes":\s*\[([^\]]*)\]/);
    if (changesMatch) {
      try {
        const changesStr = '[' + changesMatch[1] + ']';
        const parsedChanges = JSON.parse(changesStr);
        extractedData.changes = parsedChanges;
      } catch (e) {
        // If changes parsing fails, extract individual strings
        // @ts-ignore
        const changeStrings = changesMatch[1].match(/"([^"]*(?:\\.[^"]*)*)"/g);
        if (changeStrings) {
          // @ts-ignore
          extractedData.changes = changeStrings.map((s) => s.slice(1, -1).replace(/\\"/g, '"'));
        }
      }
    }
    
    // Try to extract fixedCode (this is more complex due to potential multiline code)
    const fixedCodeMatch = responseText.match(/"fixedCode":\s*"([^"]*(?:\\.[^"]*)*)"(?=\s*[,}])/s);
    if (fixedCodeMatch) {
      // @ts-ignore
      extractedData.fixedCode = fixedCodeMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
    } else {
      // Try to find null value
      const nullMatch = responseText.match(/"fixedCode":\s*null/);
      if (nullMatch) {
        extractedData.fixedCode = null;
      }
    }
    
    console.log(`🔍 Extracted partial data:`, {
      needsFix: extractedData.needsFix,
      hasFixedCode: !!extractedData.fixedCode,
      explanationLength: extractedData.explanation.length,
      changesCount: extractedData.changes.length
    });
    
    return extractedData;
  } catch (error) {
    console.warn('Failed to extract partial data:', error instanceof Error ? error.message : String(error));
    return {
      needsFix: false,
      fixedCode: null,
      explanation: 'Failed to extract data from malformed AI response',
      changes: []
    };
  }
}

/**
 * Process an orchestrated feature implementation job
 * @param {JobData} jobData - The job data containing context
 * @param {Database} db - Prisma database connection
 */
async function processFileCreationJob(jobData, db) {
  const { jobId, question, summary, projectId } = jobData;
  
  try {
    console.log(`🎯 Processing orchestrated feature implementation job ${jobId}`);
    
    // Update job status
    await db.fixJob.update({
      where: { id: jobId },
      data: { 
        status: 'PROCESSING',
        progress: 5,
        currentFile: 'Planning orchestrated implementation...'
      }
    });
    
    // Step 1: Analyze and plan orchestrated implementation
    console.log(`🏗️ Planning orchestrated implementation for: ${question}`);
    const orchestratedPlan = await analyzeFeatureRequest(question, summary, projectId);
    
    if (!orchestratedPlan.needsNewFiles && !orchestratedPlan.orchestratedPlan) {
      // If no orchestration needed, redirect to regular fix job
      console.log(`🔄 Redirecting to regular fix job - no orchestration needed`);
      return await processRegularFixJob(jobData, db);
    }
    
    // Step 2: Execute orchestrated plan
    /** @type {OrchestrationPlan} */
    const plan = orchestratedPlan.orchestratedPlan || {};
    const filesToCreate = [];
    const filesToModify = [];
    let totalSteps = 0;
    let currentStep = 0;
    
    // Calculate total steps for progress tracking
    totalSteps += (plan.newFiles?.length || 0);
    totalSteps += (plan.modifiedFiles?.length || 0);
    totalSteps += (plan.dependencyUpdates?.length || 0);
    totalSteps += (plan.configurationChanges?.length || 0);
    totalSteps += (plan.integrationSteps?.length || 0);
    
    // Step 2a: Generate new files
    if (plan?.newFiles && plan.newFiles.length > 0) {
      await db.fixJob.update({
        where: { id: jobId },
        data: { 
          progress: 10,
          currentFile: 'Creating new files...'
        }
      });
      
      const repoContext = await getRepositoryContext(projectId);
      
      for (const fileSpec of plan.newFiles) {
        console.log(`📝 Creating new file: ${fileSpec.path}`);
        
        await db.fixJob.update({
          where: { id: jobId },
          data: { 
            progress: 10 + Math.round((currentStep / totalSteps) * 70),
            currentFile: `Creating ${fileSpec.path}...`
          }
        });
        
        const fileContent = await generateNewFile(fileSpec, repoContext, question);
        
        filesToCreate.push({
          fileName: fileSpec.path,
          content: fileContent.code || '',
          explanation: fileContent.explanation || 'New file created as part of orchestrated implementation',
          fileType: fileSpec.type,
          dependencies: fileContent.dependencies || []
        });
        
        currentStep++;
      }
    }
    
    // Step 2b: Modify existing files (imports, exports, registrations)
    if (plan?.modifiedFiles && plan.modifiedFiles.length > 0) {
      await db.fixJob.update({
        where: { id: jobId },
        data: { 
          progress: 30,
          currentFile: 'Updating existing files...'
        }
      });
      
      for (const modification of plan.modifiedFiles) {
        console.log(`🔧 Modifying file: ${modification.path}`);
        
        await db.fixJob.update({
          where: { id: jobId },
          data: { 
            progress: 30 + Math.round((currentStep / totalSteps) * 70),
            currentFile: `Updating ${modification.path}...`
          }
        });
        
        // Generate the modification content
        // Add required 'type' property to modification object
        const modificationWithType = {
          ...modification,
          type: 'modify', // Default to 'modify' type
          instructions: modification.changes ? modification.changes.join(', ') : undefined
        };
        
        const modificationContent = await generateFileModification(
          modificationWithType, 
          question,
          projectId,
          db
        );
        
        filesToModify.push({
          fileName: modification.path,
          originalCode: modificationContent.originalCode || '',
          fixedCode: modificationContent.fixedCode || '',
          changes: modificationContent.changes || [],
          explanation: modificationContent.explanation || 'File updated for orchestrated integration',
          summary: modificationContent.summary || `Modified ${modification.path}`,
          type: 'MODIFY'
        });
        
        currentStep++;
      }
    }
    
    // Step 2c: Handle dependency updates
    const dependencyUpdates = [];
    if (plan?.dependencyUpdates && plan.dependencyUpdates.length > 0) {
      await db.fixJob.update({
        where: { id: jobId },
        data: { 
          progress: 50,
          currentFile: 'Updating dependencies...'
        }
      });
      
      for (const depUpdate of plan.dependencyUpdates) {
        console.log(`📦 Updating dependencies in: ${depUpdate.file}`);
        
        // Collect reasons from all packages or use a default
        const reasons = depUpdate.packages.map(pkg => pkg.reason).filter(Boolean);
        const explanation = reasons.length > 0 
          ? reasons[0] // Use first package's reason as representative
          : 'Dependencies added for new feature';
          
        dependencyUpdates.push({
          fileName: depUpdate.file,
          dependencies: depUpdate.packages,
          explanation: explanation
        });
        
        currentStep++;
      }
    }
    
    // Step 2d: Handle configuration changes
    const configurationChanges = [];
    if (plan?.configurationChanges && plan.configurationChanges.length > 0) {
      await db.fixJob.update({
        where: { id: jobId },
        data: { 
          progress: 70,
          currentFile: 'Updating configuration files...'
        }
      });
      
      for (const configChange of plan.configurationChanges) {
        console.log(`⚙️ Updating configuration: ${configChange.file}`);
        
        configurationChanges.push({
          fileName: configChange.file,
          changes: configChange.changes,
          explanation: 'Configuration updated for new feature'
        });
        
        currentStep++;
      }
    }
    
    // Step 3: Complete the orchestrated implementation
    await db.fixJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        progress: 100,
        currentFile: null,
        result: {
          action: 'ORCHESTRATED_IMPLEMENTATION',
          orchestratedPlan: {
            newFiles: filesToCreate,
            modifiedFiles: filesToModify,
            dependencyUpdates: dependencyUpdates,
            configurationChanges: configurationChanges,
            integrationSteps: plan?.integrationSteps || [],
            summary: orchestratedPlan?.reasoning || 'Orchestrated implementation completed'
            // language property removed - not part of OrchestrationPlan type
          }
        },
        completedAt: new Date()
      }
    });
    
    console.log(`✅ Orchestrated implementation job ${jobId} completed:`);
    console.log(`   📝 ${filesToCreate.length} new files created`);
    console.log(`   🔧 ${filesToModify.length} files modified`);
    console.log(`   📦 ${dependencyUpdates.length} dependency updates`);
    console.log(`   ⚙️ ${configurationChanges.length} configuration changes`);
    
  } catch (error) {
    console.error(`❗ Error processing orchestrated implementation job ${jobId}:`, error);
    
    await db.fixJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date()
      }
    });
    
    throw error;
  }
}

/**
 * @typedef {Object} OrchestrationRules
 * @property {string} dependencyFile - Dependency file name
 * @property {string} mainFile - Main entry file
 * @property {string} indexFile - Index file
 * @property {string} importPattern - Import pattern example
 * @property {string} examplePath - Example file path
 * @property {string} fileTypes - Supported file types
 * @property {string[]} configFiles - Configuration files
 * @property {string} testDir - Test directory
 * @property {string} packageManager - Package manager command
 * @property {string} dependencyFormat - Dependency format pattern
 * @property {string[]} integrationFiles - Integration files
 */

/**
 * @typedef {Object} OrchestrationPlan
 * @property {Array<{path: string, type: string, description: string, priority: string, dependencies?: string[]}>} [newFiles] - New files to create
 * @property {Array<{path: string, reason: string, changes: string[]}>} [modifiedFiles] - Files to modify
 * @property {Array<{file: string, packages: Array<{name: string, version: string, reason: string}>}>} [dependencyUpdates] - Dependencies to update
 * @property {Array<{file: string, changes: string[]}>} [configurationChanges] - Configuration changes
 * @property {string[]} [integrationSteps] - Integration steps
 */

/**
 * @typedef {Object} AnalysisResult
 * @property {boolean} needsNewFiles - Whether new files are needed
 * @property {string} reasoning - Reasoning for the decision
 * @property {OrchestrationPlan} [orchestratedPlan] - The orchestration plan
 * @property {string} [summary] - Summary of the analysis
 * @property {string} [estimatedFiles] - Estimated number of files
 */

/**
 * Get language-specific orchestration rules for coordinated feature implementation
 * @param {string} language - Programming language
 * @returns {OrchestrationRules} Orchestration rules including dependency files, import patterns, etc.
 */
function getLanguageOrchestrationRules(language) {
  switch(language) {
    case 'python':
      return {
        dependencyFile: 'requirements.txt',
        mainFile: 'src/main.py',
        indexFile: 'src/__init__.py',
        importPattern: 'from .services.email_service import EmailService',
        examplePath: 'src/services/email_service.py',
        fileTypes: 'service|model|utility|api|handler|middleware',
        configFiles: ['setup.py', 'pyproject.toml', 'config.py'],
        testDir: 'tests/',
        packageManager: 'pip',
        dependencyFormat: 'package==version',
        integrationFiles: ['src/__init__.py', 'src/main.py', 'config.py']
      };
    case 'go':
      return {
        dependencyFile: 'go.mod',
        mainFile: 'cmd/main.go',
        indexFile: 'cmd/main.go',
        importPattern: 'import "github.com/user/repo/pkg/services"',
        examplePath: 'pkg/services/email.go',
        fileTypes: 'service|handler|model|utility|package|cmd',
        configFiles: ['go.mod', 'go.sum', 'config/config.go'],
        testDir: '*_test.go',
        packageManager: 'go mod',
        dependencyFormat: 'require github.com/package/name version',
        integrationFiles: ['cmd/main.go', 'internal/app/app.go']
      };
    case 'rust':
      return {
        dependencyFile: 'Cargo.toml',
        mainFile: 'src/main.rs',
        indexFile: 'src/lib.rs',
        importPattern: 'use crate::services::email::EmailService;',
        examplePath: 'src/services/email.rs',
        fileTypes: 'service|model|utility|handler|module',
        configFiles: ['Cargo.toml', 'Cargo.lock', 'src/config.rs'],
        testDir: 'tests/',
        packageManager: 'cargo',
        dependencyFormat: 'package = "version"',
        integrationFiles: ['src/lib.rs', 'src/main.rs', 'src/mod.rs']
      };
    case 'cpp':
      return {
        dependencyFile: 'CMakeLists.txt',
        mainFile: 'src/main.cpp',
        indexFile: 'src/main.cpp',
        importPattern: '#include "services/EmailService.h"',
        examplePath: 'src/services/EmailService.cpp',
        fileTypes: 'service|model|utility|handler|class',
        configFiles: ['CMakeLists.txt', 'vcpkg.json', 'config.hpp'],
        testDir: 'tests/',
        packageManager: 'cmake/vcpkg',
        dependencyFormat: 'find_package(PackageName REQUIRED)',
        integrationFiles: ['src/main.cpp', 'include/common.h']
      };
    case 'java':
      return {
        dependencyFile: 'pom.xml',
        mainFile: 'src/main/java/Main.java',
        indexFile: 'src/main/java/Main.java',
        importPattern: 'import com.project.services.EmailService;',
        examplePath: 'src/main/java/services/EmailService.java',
        fileTypes: 'service|model|utility|controller|component',
        configFiles: ['pom.xml', 'application.properties', 'application.yml'],
        testDir: 'src/test/java/',
        packageManager: 'maven',
        dependencyFormat: '<dependency><groupId>group</groupId><artifactId>artifact</artifactId></dependency>',
        integrationFiles: ['src/main/java/Main.java', 'src/main/java/config/AppConfig.java']
      };
    default: // javascript/typescript
      return {
        dependencyFile: 'package.json',
        mainFile: 'src/App.tsx',
        indexFile: 'src/index.ts',
        importPattern: 'import { EmailService } from "./services/emailService";',
        examplePath: 'src/services/emailService.ts',
        fileTypes: 'component|service|utility|api|hook|page',
        configFiles: ['package.json', 'tsconfig.json', '.env'],
        testDir: 'src/__tests__/',
        packageManager: 'npm',
        dependencyFormat: '"package": "^version"',
        integrationFiles: ['src/index.ts', 'src/App.tsx', 'src/routes/index.ts']
      };
  }
}

/**
 * Analyze a feature request and plan ORCHESTRATED implementation
 * @param {string} question - The feature request
 * @param {string} summary - Summary of the request
 * @param {string} projectId - Project ID for context
 * @returns {Promise<AnalysisResult>} Orchestrated analysis result
 */
async function analyzeFeatureRequest(question, summary, projectId) {
  // Get repository context to detect language
  const repoContext = await getRepositoryContext(projectId);
  const primaryLanguage = repoContext?.primaryLanguage || 'javascript';
  
  console.log(`🎭 Planning orchestrated implementation for ${primaryLanguage} project`);
  
  // Get language-specific orchestration rules
  /** @type {OrchestrationRules} */
  const orchestrationRules = getLanguageOrchestrationRules(primaryLanguage);
  
  const orchestratedPrompt = `
Plan a COMPLETE, ORCHESTRATED implementation for this feature request:

Request: "${question}"
${summary ? `Summary: "${summary}"` : ''}

Project Details:
- Language: ${primaryLanguage}
- Dependency File: ${orchestrationRules?.dependencyFile || 'package.json'}
- Main Entry: ${orchestrationRules?.mainFile || 'src/index.js'}
- Import Pattern: ${orchestrationRules?.importPattern || "import { } from './'"}

Repository Context:
- Frameworks: ${repoContext?.frameworks?.join(', ') || 'Unknown'}
- File Count: ${repoContext?.fileCount || 0}
- Existing Directories: ${repoContext?.directories?.join(', ') || 'Unknown'}

You must plan ALL COORDINATED CHANGES needed for a working feature:

Respond with a JSON object:
{
  "needsNewFiles": boolean,
  "reasoning": "explanation of the orchestrated approach",
  "orchestratedPlan": {
    "newFiles": [
      {
        "path": "${orchestrationRules?.examplePath || 'src/services/newService.js'}",
        "type": "${orchestrationRules?.fileTypes || 'service'}",
        "description": "what this file will do",
        "priority": "high|medium|low",
        "dependencies": ["list of packages this file needs"]
      }
    ],
    "modifiedFiles": [
      {
        "path": "${orchestrationRules?.mainFile || 'src/index.js'}",
        "reason": "why this file needs modification",
        "changes": ["import new component", "register service", "add route"]
      }
    ],
    "dependencyUpdates": [
      {
        "file": "${orchestrationRules?.dependencyFile || 'package.json'}",
        "packages": [
          {"name": "package-name", "version": "^1.0.0", "reason": "needed for X feature"}
        ]
      }
    ],
    "configurationChanges": [
      {
        "file": "config file path",
        "changes": ["add environment variables", "update settings"]
      }
    ],
    "integrationSteps": [
      "Step 1: Import in main file",
      "Step 2: Export from index",
      "Step 3: Update configuration"
    ]
  },
  "summary": "Complete feature implementation plan",
  "estimatedFiles": "total number of files that will be created/modified"
}

CRITICAL: This must be a COMPLETE working feature, not isolated files!
Think about:
1. What new files need to be created?
2. What existing files need imports/exports updated?
3. What dependencies need to be added?
4. What configuration files need updates?
5. How does this integrate with the existing codebase?

Examples of orchestrated thinking:
- "Add chat feature" → Create ChatComponent + update package.json (socket.io) + export from index + import in App + add route
- "Add email service" → Create EmailService + update dependencies (nodemailer) + export from services + import in main
- "Add user authentication" → Create AuthService + dependencies (bcrypt, jwt) + middleware + routes + config updates
`;

  try {
    const { text } = await generateText({
      model: claudeModel,
      prompt: orchestratedPrompt,
      temperature: 0.1,
      maxTokens: 40000, // Increased for orchestrated planning
    });
    
    // Parse the response
    const cleanedResponse = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    /** @type {{needsNewFiles: boolean, reasoning: string, orchestratedPlan: {newFiles: Array<any>, modifiedFiles: Array<any>, dependencyUpdates: Array<any>, configurationChanges: Array<any>, integrationSteps: Array<any>}, summary?: string, estimatedFiles?: string}} */
    let analysis;
    try {
      analysis = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.warn('Failed to parse analysis JSON, creating default response');
      // Create a default analysis with all required properties
      analysis = {
        needsNewFiles: true,
        reasoning: 'Failed to parse AI response, but the feature likely requires new files',
        orchestratedPlan: {
          newFiles: [],
          modifiedFiles: [],
          dependencyUpdates: [],
          configurationChanges: [],
          integrationSteps: []
        },
        summary: 'Failed to parse AI response',
        estimatedFiles: '0'
      };
    }
    
    console.log(`🔍 Analysis result for ${primaryLanguage}:`, {
      needsNewFiles: analysis.needsNewFiles,
      newFilesCount: analysis.orchestratedPlan?.newFiles?.length || 0,
      modifiedFilesCount: analysis.orchestratedPlan?.modifiedFiles?.length || 0,
      reasoning: analysis.reasoning?.substring(0, 100) + '...'
    });
    
    return analysis;
    
  } catch (error) {
    console.error('Error analyzing feature request:', error);
    // Default to regular fix job if analysis fails
    return {
      needsNewFiles: false,
      reasoning: 'Analysis failed, defaulting to regular fix job',
      orchestratedPlan: {
        newFiles: [],
        modifiedFiles: [],
        dependencyUpdates: [],
        configurationChanges: [],
        integrationSteps: []
      },
      summary: 'Analysis error',
      estimatedFiles: '0'
    };
  }
}

/**
 * @typedef {Object} RepositoryContext
 * @property {Array<{fileName: string, summary: string}>} files - Array of file objects
 * @property {string[]} directories - Common directories in the project
 * @property {string[]} frameworks - Detected frameworks
 * @property {string} primaryLanguage - Primary programming language
 * @property {{useTypeScript: boolean, hasComponents: boolean, hasUtils: boolean, hasApi: boolean, hasStyles: boolean}} patterns - Detected code patterns
 * @property {number} fileCount - Total number of files
 * @property {{components?: string, utils?: string}} commonPaths - Common paths in the project
 */

/**
 * Generate repository context for file creation
 * @param {string} projectId - Project ID
 * @returns {Promise<RepositoryContext>} Repository context
 */
async function getRepositoryContext(projectId) {
  try {
    // Get project structure from database
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    const files = await prisma.sourceCodeEmbedding.findMany({
      where: { projectId },
      select: {
        fileName: true,
        summary: true
      },
      take: 50 // Get top 50 files for context
    });
    
    // Analyze project structure
    const directories = [...new Set(files.map(f => f.fileName.split('/').slice(0, -1).join('/')).filter(d => d))]
      .sort()
      .slice(0, 20); // Top 20 directories
    
    const languageInfo = detectFramework(files.map(f => f.fileName));
    const patterns = detectPatterns(files);
    
    return {
      files, // Include files array for language detection
      directories,
      frameworks: languageInfo.frameworks,
      primaryLanguage: languageInfo.primaryLanguage,
      patterns,
      fileCount: files.length,
      commonPaths: getCommonPaths(files)
    };
    
  } catch (error) {
    console.error('Error getting repository context:', error);
    return {
      files: [],
      directories: ['src/components', 'src/utils', 'src/pages'],
      frameworks: ['javascript'],
      primaryLanguage: 'javascript',
      patterns: { 
        useTypeScript: true,
        hasComponents: false,
        hasUtils: false,
        hasApi: false,
        hasStyles: false
      },
      fileCount: 0,
      commonPaths: {}
    };
  }
}

/**
 * Generate content for a new file
 * @param {{path: string, type: string, description: string, priority: string}} fileSpec - File specification
 * @param {{frameworks?: string[], directories?: string[], patterns?: {useTypeScript?: boolean}, fileCount?: number, primaryLanguage?: string}} repoContext - Repository context
 * @param {string} question - Original question
 * @returns {Promise<{code: string, explanation: string, dependencies: string[]}>} Generated file content
 */
async function generateNewFile(fileSpec, repoContext, question) {
  // Validate fileSpec has required properties
  if (!fileSpec || typeof fileSpec !== 'object') {
    console.error('Invalid fileSpec provided to generateNewFile:', fileSpec);
    return {
      code: '// Error: Invalid file specification provided',
      explanation: 'Invalid file specification - missing required properties',
      dependencies: []
    };
  }
  
  // Ensure required properties exist with defaults
  const safeFileSpec = {
    path: fileSpec.path || 'src/components/DefaultComponent.tsx',
    type: fileSpec.type || 'component',
    description: fileSpec.description || 'Generated component',
    priority: fileSpec.priority || 'medium'
  };
  
  // Ensure repoContext has the expected structure with defaults
  const safeRepoContext = {
    frameworks: repoContext?.frameworks || ['javascript'],
    directories: repoContext?.directories || ['src'],
    patterns: repoContext?.patterns || { useTypeScript: false },
    fileCount: repoContext?.fileCount || 0,
    primaryLanguage: repoContext?.primaryLanguage || 'javascript'
  };
  
  const primaryLanguage = safeRepoContext.primaryLanguage;
  
  // Generate language-specific prompts
  /**
   * @param {string} language - The programming language for the prompt
   */
  const getLanguagePrompt = (language) => {
    switch(language) {
      case 'python':
        return `
Generate a complete Python ${safeFileSpec.type} for this request:

File: ${safeFileSpec.path}
Type: ${safeFileSpec.type}
Description: ${safeFileSpec.description}
Original Request: "${question}"

Requirements:
1. Generate COMPLETE, working Python code
2. Follow PEP 8 style guidelines
3. Include proper docstrings
4. Add type hints if appropriate
5. Include proper imports
6. Add error handling with try/except
7. Follow Python best practices
8. Include proper class/function structure

Example patterns:
- Classes: Use PascalCase
- Functions: Use snake_case
- Constants: Use UPPER_CASE
- Add __init__.py imports if needed
`;
      case 'go':
        return `
Generate a complete Go ${safeFileSpec.type} for this request:

File: ${safeFileSpec.path}
Type: ${safeFileSpec.type}
Description: ${safeFileSpec.description}
Original Request: "${question}"

Requirements:
1. Generate COMPLETE, working Go code
2. Follow Go conventions (gofmt style)
3. Include proper package declaration
4. Add proper imports
5. Include error handling
6. Add godoc comments
7. Use proper Go idioms
8. Include proper struct/interface definitions

Example patterns:
- Package: Use lowercase
- Functions: Use CamelCase for public, camelCase for private
- Constants: Use CamelCase
- Variables: Use camelCase
`;
      case 'rust':
        return `
Generate a complete Rust ${safeFileSpec.type} for this request:

File: ${safeFileSpec.path}
Type: ${safeFileSpec.type}
Description: ${safeFileSpec.description}
Original Request: "${question}"

Requirements:
1. Generate COMPLETE, working Rust code
2. Follow Rust conventions (rustfmt style)
3. Include proper use statements
4. Add proper error handling with Result<T, E>
5. Include doc comments with ///
6. Use proper Rust idioms
7. Include proper struct/enum definitions
8. Handle ownership and borrowing correctly

Example patterns:
- Types: Use PascalCase
- Functions: Use snake_case
- Constants: Use UPPER_CASE
- Variables: Use snake_case
`;
      case 'cpp':
        return `
Generate a complete C++ ${safeFileSpec.type} for this request:

File: ${safeFileSpec.path}
Type: ${safeFileSpec.type}
Description: ${safeFileSpec.description}
Original Request: "${question}"

Requirements:
1. Generate COMPLETE, working C++ code
2. Follow C++ best practices
3. Include proper header guards or #pragma once
4. Add proper #include statements
5. Include proper namespace declarations
6. Add error handling with exceptions
7. Include proper class/function declarations
8. Use modern C++ features appropriately

Example patterns:
- Classes: Use PascalCase
- Functions: Use camelCase or snake_case
- Constants: Use UPPER_CASE
- Variables: Use camelCase
`;
      case 'java':
        return `
Generate a complete Java ${safeFileSpec.type} for this request:

File: ${safeFileSpec.path}
Type: ${safeFileSpec.type}
Description: ${safeFileSpec.description}
Original Request: "${question}"

Requirements:
1. Generate COMPLETE, working Java code
2. Follow Java conventions
3. Include proper package declaration
4. Add proper imports
5. Include proper class structure
6. Add error handling with try/catch
7. Include JavaDoc comments
8. Use proper Java idioms

Example patterns:
- Classes: Use PascalCase
- Methods: Use camelCase
- Constants: Use UPPER_CASE
- Variables: Use camelCase
`;
      default: // javascript/typescript
        return `
Generate a complete ${safeRepoContext.patterns.useTypeScript ? 'TypeScript' : 'JavaScript'} ${safeFileSpec.type} for this request:

File: ${safeFileSpec.path}
Type: ${safeFileSpec.type}
Description: ${safeFileSpec.description}
Original Request: "${question}"

Project Context:
- Framework: ${safeRepoContext.frameworks.join(', ')}
- Uses TypeScript: ${safeRepoContext.patterns.useTypeScript}

Requirements:
1. Generate COMPLETE, working ${safeRepoContext.patterns.useTypeScript ? 'TypeScript' : 'JavaScript'} code
2. Follow the project's existing patterns
3. Include proper imports and exports
4. Add TypeScript types if applicable
5. Include basic error handling
6. Add helpful comments
7. Follow modern best practices
`;
    }
  };
  
  const generationPrompt = getLanguagePrompt(primaryLanguage) + `

Respond with JSON:
{
  "code": "complete file content here",
  "explanation": "what this file does and how it works",
  "dependencies": ["package names if any new deps needed"]
}
`;

  try {
    console.log(`📝 Generating file ${safeFileSpec.path}...`);
    
    const response = await generateText({
      model: claudeModel,
      prompt: generationPrompt,
      temperature: 0.1,
      maxTokens: 40000,
    });
    
    // Parse the response
    const cleanedResponse = response.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    let result;
    try {
      result = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.warn('Failed to parse file generation JSON, using regex extraction');
      result = extractFileGenerationData(cleanedResponse);
    }
    
    console.log(`📝 Generated ${primaryLanguage} file ${safeFileSpec.path} (${result.code?.length || 0} characters)`);
    
    return result;
    
  } catch (error) {
    console.error(`Error generating file ${safeFileSpec.path}:`, error);
    return {
      // @ts-ignore
      code: `// Error generating file: ${error.message}\n// TODO: Implement ${safeFileSpec.description}`,
      // @ts-ignore
      explanation: `Failed to generate file: ${error.message}`,
      dependencies: []
    };
  }
}

/**
 * Helper function to detect framework from file paths
 * @param {string[]} filePaths - Array of file paths
 * @returns {{frameworks: string[], primaryLanguage: string}} Detected frameworks and primary language
 */
function detectFramework(filePaths) {
  const frameworks = [];
  const languages = {
    python: 0,
    go: 0,
    rust: 0,
    cpp: 0,
    java: 0,
    javascript: 0,
    typescript: 0
  };
  
  // Count file extensions to determine primary language
  filePaths.forEach(path => {
    if (path.endsWith('.py')) languages.python += 1;
    if (path.endsWith('.go')) languages.go += 1;
    if (path.endsWith('.rs')) languages.rust += 1;
    if (path.endsWith('.cpp') || path.endsWith('.cc') || path.endsWith('.c')) languages.cpp += 1;
    if (path.endsWith('.java')) languages.java += 1;
    if (path.endsWith('.js') || path.endsWith('.jsx')) languages.javascript += 1;
    if (path.endsWith('.ts') || path.endsWith('.tsx')) languages.typescript += 1;
  });
  
  // Detect frameworks
  if (filePaths.some(p => p.includes('next.config') || p.includes('pages/') || p.includes('app/'))) {
    frameworks.push('nextjs');
  }
  if (filePaths.some(p => p.includes('src/') && p.includes('.tsx'))) {
    frameworks.push('react');
  }
  if (filePaths.some(p => p.includes('nuxt.config') || p.includes('.vue'))) {
    frameworks.push('nuxt');
  }
  if (filePaths.some(p => p.includes('angular.json') || p.includes('.component.'))) {
    frameworks.push('angular');
  }
  
  // Determine primary language by count
  let primaryLanguage = 'javascript';
  let maxCount = 0;
  
  for (const [lang, count] of Object.entries(languages)) {
    if (count > maxCount) {
      maxCount = count;
      primaryLanguage = lang;
    }
  }
  
  // If TypeScript is detected, prefer it over JavaScript
  if (languages.typescript > 0 && primaryLanguage === 'javascript') {
    primaryLanguage = 'typescript';
  }
  
  return {
    frameworks: frameworks.length > 0 ? frameworks : ['javascript'],
    primaryLanguage
  };
}

/**
 * Helper function to detect code patterns
 * @param {Array<{fileName?: string, summary?: string}>} files - Array of file objects
 * @returns {{useTypeScript: boolean, hasComponents: boolean, hasUtils: boolean, hasApi: boolean, hasStyles: boolean}} Detected patterns
 */
function detectPatterns(files) {
  // Ensure we have valid files array
  if (!files || !Array.isArray(files)) {
    return {
      useTypeScript: false,
      hasComponents: false,
      hasUtils: false,
      hasApi: false,
      hasStyles: false
    };
  }
  
  const patterns = {
    useTypeScript: files.some(f => f && f.fileName && (f.fileName.includes('.ts') || f.fileName.includes('.tsx'))),
    hasComponents: files.some(f => f && f.fileName && f.fileName.includes('components/')),
    hasUtils: files.some(f => f && f.fileName && (f.fileName.includes('utils/') || f.fileName.includes('lib/'))),
    hasApi: files.some(f => f && f.fileName && (f.fileName.includes('api/') || f.fileName.includes('endpoints/'))),
    hasStyles: files.some(f => f && f.fileName && (f.fileName.includes('.css') || f.fileName.includes('.scss')))
  };
  
  return patterns;
}

/**
 * Helper function to get common paths
 * @param {Array<{fileName?: string, summary?: string}>} files - Array of file objects
 * @returns {Object} Common paths object
 */
function getCommonPaths(files) {
  const paths = {};
  
  // Ensure we have valid files array
  if (!files || !Array.isArray(files)) {
    return paths;
  }
  
  // Find common component path
  const componentFiles = files.filter(f => f && f.fileName && f.fileName.includes('component'));
  if (componentFiles.length > 0) {
    const firstFile = componentFiles[0];
    if (firstFile && firstFile.fileName) {
      paths.components = firstFile.fileName.split('/').slice(0, -1).join('/');
    }
  }
  
  // Find common utility path
  const utilFiles = files.filter(f => f && f.fileName && (f.fileName.includes('util') || f.fileName.includes('lib')));
  if (utilFiles.length > 0) {
    const firstFile = utilFiles[0];
    if (firstFile && firstFile.fileName) {
      paths.utils = firstFile.fileName.split('/').slice(0, -1).join('/');
    }
  }
  
  return paths;
}

/**
 * Helper function to extract analysis data from malformed JSON
 * @param {string} text - Raw text response
 * @param {string} primaryLanguage - Primary language detected
 * @returns {{needsNewFiles: boolean, reasoning: string, files: Array<any>, summary: string, nextSteps: Array<string>}} Extracted analysis data
 */
function extractAnalysisData(text, primaryLanguage = 'javascript') {
  const needsNewFiles = text.toLowerCase().includes('"needsnewfiles": true') || 
                        text.toLowerCase().includes('"needsnewfiles":true');
  
  let reasoning = 'Could not extract reasoning';
  const reasoningMatch = text.match(/"reasoning":\s*"([^"]*)"/i);
  if (reasoningMatch && reasoningMatch[1]) {
    reasoning = reasoningMatch[1];
  }
  
  // Try to extract files from malformed JSON
  const extractedFiles = [];
  
  // Look for file patterns in the text
  const pathMatches = [...text.matchAll(/"path":\s*"([^"]+)"/g)];
  const typeMatches = [...text.matchAll(/"type":\s*"([^"]+)"/g)];
  const descMatches = [...text.matchAll(/"description":\s*"([^"]+)"/g)];
  
  // Create file objects from extracted data
  const maxFiles = Math.max(pathMatches.length, typeMatches.length, descMatches.length);
  
  for (let i = 0; i < maxFiles; i++) {
    const fileSpec = {
      path: pathMatches[i]?.[1] ?? `src/components/Component${i + 1}.tsx`,
      type: typeMatches[i]?.[1] ?? 'component',
      description: descMatches[i]?.[1] ?? 'Generated component',
      priority: 'medium'
    };
    extractedFiles.push(fileSpec);
  }
  
  // If no files found, create a default one if needsNewFiles is true
  if (extractedFiles.length === 0 && needsNewFiles) {
    /**
     * @param {string} language - The programming language
     * @returns {Object} Default file configuration
     */
    const getDefaultFile = (language) => {
      switch(language) {
        case 'python':
          return {
            path: 'src/services/new_service.py',
            type: 'service',
            description: 'New Python service from feature request',
            priority: 'high'
          };
        case 'go':
          return {
            path: 'pkg/services/new_service.go',
            type: 'service',
            description: 'New Go service from feature request',
            priority: 'high'
          };
        case 'rust':
          return {
            path: 'src/services/new_service.rs',
            type: 'service',
            description: 'New Rust service from feature request',
            priority: 'high'
          };
        case 'cpp':
          return {
            path: 'src/services/NewService.cpp',
            type: 'service',
            description: 'New C++ service from feature request',
            priority: 'high'
          };
        case 'java':
          return {
            path: 'src/main/java/services/NewService.java',
            type: 'service',
            description: 'New Java service from feature request',
            priority: 'high'
          };
        default: // javascript/typescript
          return {
            path: 'src/components/NewComponent.tsx',
            type: 'component',
            description: 'New component from feature request',
            priority: 'high'
          };
      }
    };
    
    extractedFiles.push(getDefaultFile(primaryLanguage));
  }
  
  return {
    needsNewFiles,
    reasoning,
    files: extractedFiles,
    summary: 'Partial analysis due to parsing error',
    nextSteps: []
  };
}

/**
 * Helper function to extract file generation data from malformed JSON
 * @param {string} text - Raw text response
 * @returns {Object} Extracted file data
 */
function extractFileGenerationData(text) {
  let code = '';
  let explanation = 'Could not extract explanation';
  
  console.log('🔍 Extracting from malformed JSON, text length:', text.length);
  
  // Try multiple strategies for extracting code
  
  // Strategy 1: Look for code in quotes (handling escaped quotes and newlines)
  let codeMatch = text.match(/"code":\s*"((?:[^"\\]|\\.)*)"(?:\s*,|\s*})/s);
  if (codeMatch && codeMatch[1]) {
    code = codeMatch[1]
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }
  
  // Strategy 2: Look for code blocks in markdown format
  if (!code) {
    const markdownMatch = text.match(/```(?:typescript|javascript|tsx|jsx)?\n([\s\S]*?)```/i);
    if (markdownMatch && markdownMatch[1]) {
      code = markdownMatch[1].trim();
    }
  }
  
  // Strategy 3: Look for code without quotes (for cases where quotes are missing)
  if (!code) {
    const rawCodeMatch = text.match(/"code":\s*([^,}]+)/s);
    if (rawCodeMatch && rawCodeMatch[1]) {
      code = rawCodeMatch[1].trim();
    }
  }
  
  // Extract explanation with better handling
  const explanationMatch = text.match(/"explanation":\s*"((?:[^"\\]|\\.)*)"(?:\s*,|\s*})/s);
  if (explanationMatch && explanationMatch[1]) {
    explanation = explanationMatch[1]
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }
  
  // Fallback: try to extract explanation without quotes
  if (explanation === 'Could not extract explanation') {
    const rawExplanationMatch = text.match(/"explanation":\s*([^,}]+)/s);
    if (rawExplanationMatch && rawExplanationMatch[1]) {
      explanation = rawExplanationMatch[1].trim().replace(/[",]/g, '');
    }
  }
  
  console.log('📝 Extracted code length:', code.length, 'explanation length:', explanation.length);
  
  return {
    code,
    explanation,
    dependencies: []
  };
}

/**
 * Generate file modification content for orchestrated integration
 * @param {{path: string, type: string, reason: string, instructions?: string}} modification - Modification specification
 * @param {string} originalQuestion - Original feature request
 * @param {string} projectId - Project ID
 * @param {import('@prisma/client').PrismaClient} db - Database client
 * @returns {Promise<{originalCode: string, fixedCode: string, changes: Array<{lineNumber: number, type: string, oldContent?: string, newContent?: string, reason?: string}>, explanation: string, summary: string}>} Generated modification
 */
async function generateFileModification(modification, originalQuestion, projectId, db) {
  try {
    console.log(`🔧 generateFileModification called with:`);
    console.log(`   - modification.path: ${modification.path}`);
    console.log(`   - projectId: ${projectId}`);
    console.log(`   - db defined: ${!!db}`);
    console.log(`   - db type: ${typeof db}`);
    
    // First, fetch the original file content from GitHub
    let originalCode = '';
    try {
      // Get project information to fetch from GitHub
      const project = await db.project.findUnique({
        where: { id: projectId },
        select: {
          githubOwner: true,
          githubRepo: true,
          githubAccessToken: true
        }
      });
      
      if (!project) {
        console.log(`⚠️ Project not found: ${projectId}`);
        return {
          originalCode: '',
          fixedCode: '',
          changes: [],
          explanation: `Project not found`,
          summary: 'Project not found'
        };
      }
      
      console.log(`🔍 Fetching file from GitHub:`);
      console.log(`   - Owner: ${project.githubOwner}`);
      console.log(`   - Repo: ${project.githubRepo}`);
      console.log(`   - Path: ${modification.path}`);
      console.log(`   - Has Token: ${!!project.githubAccessToken}`);
      
      // Fetch file content from GitHub
      const octokit = new Octokit({
        auth: project.githubAccessToken
      });
      
      try {
        const cleanPath = modification.path.startsWith('/') ? modification.path.slice(1) : modification.path;
        console.log(`   - Clean Path: ${cleanPath}`);
        
        const response = await octokit.repos.getContent({
          owner: project.githubOwner,
          repo: project.githubRepo,
          path: cleanPath
        });
        
        if (response.data && response.data.content) {
          originalCode = Buffer.from(response.data.content, 'base64').toString('utf-8');
          console.log(`📄 Fetched original content from GitHub for ${modification.path}, length: ${originalCode.length}`);
        } else {
          console.log(`⚠️ Could not fetch content from GitHub for ${modification.path}`);
          return {
            originalCode: '',
            fixedCode: '',
            changes: [],
            explanation: `File ${modification.path} not found in repository`,
            summary: 'File not found'
          };
        }
      } catch (githubError) {
        console.error(`⚠️ GitHub API error fetching ${modification.path}:`, githubError.message);
        // Try a simpler approach - just generate the modifications without the original content
        console.log(`🔄 Attempting to generate modifications without original content`);
        originalCode = '// Original file content not available';
      }
    } catch (fetchError) {
      console.error(`⚠️ Error fetching original file content:`, fetchError);
      return {
        originalCode: '',
        fixedCode: '',
        changes: [],
        explanation: 'Error fetching original file content',
        summary: 'Fetch error'
      };
    }

    const prompt = `
You need to modify an existing file for orchestrated feature integration.

File to modify: ${modification.path}
Modification type: ${modification.type}
Reason: ${modification.reason}
Original request: "${originalQuestion}"

Specific instructions:
${modification.instructions || 'Generate appropriate modifications based on the type and reason.'}

CURRENT FILE CONTENT:
\`\`\`
${originalCode}
\`\`\`

Generate the complete MODIFIED file content with the necessary changes for the feature integration.
The modifications should include things like:
- Adding import statements for new components/services
- Registering new routes or middleware
- Adding exports for new modules
- Integrating new functionality into existing code

Provide your response as JSON with this structure:
{
  "fixedCode": "// Complete modified file content here",
  "changes": [
    {
      "lineNumber": 1,
      "type": "add",
      "newContent": "import { NewService } from './services/NewService';",
      "reason": "Import the new service"
    },
    {
      "lineNumber": 45,
      "type": "modify",
      "oldContent": "const routes = [existingRoute];",
      "newContent": "const routes = [existingRoute, newRoute];",
      "reason": "Add new route to routes array"
    }
  ],
  "explanation": "Brief explanation of why these changes are needed",
  "summary": "Short summary of what was modified"
}

IMPORTANT: Return the COMPLETE modified file content in fixedCode, not just the changes.
`;

    const response = await generateText({
      model: anthropic('claude-sonnet-4-20250514'),
      maxTokens: 50000,
      temperature: 0.1,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    let content = response.text || '';
    console.log(`🔧 Generated modification for ${modification.path}, content length: ${content.length}`);

    // Try to parse as JSON
    try {
      const parsed = JSON.parse(content);
      return {
        originalCode: originalCode,
        fixedCode: parsed.fixedCode || originalCode,
        changes: parsed.changes || [],
        explanation: parsed.explanation || 'File modification for orchestrated integration',
        summary: parsed.summary || `Modified ${modification.path}`
      };
    } catch (parseError) {
      console.log(`⚠️ Could not parse modification JSON, using fallback`);
      
      // If we can't parse, return original code with explanation
      return {
        originalCode: originalCode,
        fixedCode: originalCode,
        changes: [{
          lineNumber: 1,
          type: 'modify',
          oldContent: '',
          newContent: '',
          reason: modification.reason
        }],
        explanation: modification.reason,
        summary: `Need to manually modify ${modification.path}`
      };
    }
    
  } catch (error) {
    console.error(`⚠️ Error generating file modification for ${modification.path}:`, error);
    return {
      originalCode: '',
      fixedCode: '',
      changes: [],
      explanation: 'Error generating modifications',
      summary: 'Error'
    };
  }
}

/**
 * Process regular fix job (fallback when file creation is not needed)
 * @param {JobData} jobData - Job data
 * @param {Database} db - Database connection
 */
async function processRegularFixJob(jobData, db) {
  // This would call the original fix job logic
  // For now, just return a simple result
  const { jobId } = jobData;
  
  await db.fixJob.update({
    where: { id: jobId },
    data: {
      status: 'COMPLETED',
      progress: 100,
      result: {
        action: 'REDIRECT',
        message: 'This request requires fixing existing files, not creating new ones. Please use the regular fix feature.'
      },
      completedAt: new Date()
    }
  });
}

module.exports = {
  processFixJob
};
