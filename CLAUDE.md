# tasker-sequential

Deployment-agnostic task execution engine with automatic suspend/resume for infinite-length tasks.

## Architecture

tasker-sequential is a **core task execution library** with zero deployment dependencies:
- No Supabase imports
- No edge function dependencies
- Runtime-agnostic (Deno, Bun, Node.js)
- Uses pluggable storage adaptor from tasker-adaptor

### Core Concepts

**Task Execution:**
- Tasks are JavaScript code strings with `__callHostTool__()` for external service calls
- Task execution suspends when external services are needed
- Parent tasks receive results and resume automatically

**Suspend/Resume Pattern:**
- `__callHostTool__(service, method, args)` calls external services
- Suspension creates child stack run and returns control to caller
- Parent task resumes when child completes with results
- Enables infinite-length tasks by breaking work call-by-call

**Stack Processing:**
- Stack runs represent individual operations in a task execution chain
- Parent-child relationships track task dependencies
- Sequential processing with database locks prevents conflicts
- HTTP chains instead of polling for causality preservation

## Adaptor Layer

tasker-sequential depends on `tasker-adaptor` for storage:

```javascript
import { TaskExecutor, StorageAdapter } from 'tasker-adaptor';

// Use any adaptor implementation
const storage = new SupabaseAdapter(url, key);  // OR
const storage = new SQLiteAdapter('./tasks.db'); // OR
// Custom adaptor...

const executor = new TaskExecutor(storage);
const result = await executor.execute(taskRun, taskCode);
```

All storage operations go through the adaptor interface:
- Task run CRUD
- Stack run management
- Task function storage
- Credential keystore

## Deployment Options

### Supabase Edge Functions
Deploy to Supabase using **tasker-adaptor-supabase**:
- Wraps task execution in edge function endpoints
- PostgreSQL backend via Supabase
- See `packages/tasker-adaptor-supabase/CLAUDE.md`

### Deno/Bun/Node.js
Run natively using development servers:
- SQLite backend via tasker-adaptor-sqlite (no server needed)
- HTTP API via dev-server.js or deno.ts
- See root CLAUDE.md for dev server setup

## Task Code

Tasks are JavaScript functions that execute with:
- Input parameters
- `__callHostTool__()` for external service calls
- Sequential flow management
- Result aggregation

Example task structure:
```javascript
async function myTask(input) {
  // Use __callHostTool__ for external calls
  const emails = await __callHostTool__('gmail', 'users.messages.list', {userId});

  // Process results
  const results = [];
  for (const email of emails) {
    results.push({...email});
  }

  return {success: true, messages: results};
}
```

## Core Functionality

- Execution: TaskExecutor runs task code with suspend/resume
- Processing: StackProcessor handles pending service calls
- Services: ServiceClient calls wrapped external services (via adaptor)
- Storage: Pluggable adaptor for any backend (Supabase, SQLite, etc.)

## Dependencies

Core (no Supabase):
- `sequential-flow` - Flow state management
- `sdk-http-wrapper` - HTTP client for service calls
- `dotenv` - Environment configuration
- `tasker-adaptor` - Storage interface (pluggable)

Optional (based on deployment):
- `tasker-adaptor-supabase` - For Supabase backend
- `tasker-adaptor-sqlite` - For SQLite backend

## File Structure

```
packages/tasker-sequential/
├── CLAUDE.md                    # This file
├── package.json                 # No @supabase/supabase-js
├── .env.example                 # Adaptor-agnostic config
├── taskcode/                    # Task implementations
│   ├── endpoints/               # Published task code
│   └── publish.ts               # Task publishing utility
└── (no supabase/ directory)     # Moved to tasker-adaptor-supabase
```

## Related Packages

- **tasker-adaptor** - Base adaptor interface and execution logic
- **tasker-adaptor-supabase** - Supabase-specific edge functions, migrations, config
- **tasker-adaptor-sqlite** - SQLite-specific adaptor implementation

## Development

To use tasker-sequential in development:

**With SQLite (recommended for local development):**
```bash
# See root CLAUDE.md for dev-server setup
npm run dev  # Uses SQLite by default
```

**With Supabase (for production testing):**
```bash
# See tasker-adaptor-supabase/CLAUDE.md
npm run dev:supabase
```

## Key Principles

- **Zero Supabase coupling**: tasker-sequential imports nothing Supabase-specific
- **Deployment-agnostic**: Same code runs on Deno, Bun, Node.js with different adaptors
- **Adaptor-driven**: All storage/service calls use pluggable interfaces
- **Production-ready**: No mocks, simulations, or fallbacks - only real implementations
