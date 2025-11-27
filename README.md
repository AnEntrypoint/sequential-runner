# Sequential Runner

Task execution engine with automatic suspend/resume for infinite-length tasks.

## Features

- Automatic suspend/resume on external calls
- HTTP-based stack processing
- `__callHostTool__` for wrapped service calls
- Task function storage and retrieval

## Architecture

```
Task Submission → deno-executor → suspend on __callHostTool__
                        ↓
               stack-processor → wrapped service
                        ↓
               resume task with result
```

## Host Tools

Tasks call external services via `__callHostTool__`:

```javascript
export async function myTask(input) {
  const users = await __callHostTool__('database', 'getUsers', { limit: 10 });
  const email = await __callHostTool__('gapi', 'sendEmail', { to: users[0].email });
  return { sent: true };
}
```

Available services:
- `database` - Supabase operations
- `gapi` - Google API (Gmail, Calendar, etc.)
- `openai` - OpenAI API
- `keystore` - Credential storage

## Task Definition

```javascript
export const config = {
  name: 'my-task',
  description: 'My task description',
  inputs: [
    { name: 'userId', type: 'string', description: 'User ID' }
  ]
};

export async function my_task(input) {
  const data = await __callHostTool__('database', 'query', { id: input.userId });
  return { success: true, data };
}
```

## Integration with sequential-adaptor

```javascript
import { TaskExecutor, StackProcessor, createAdapter } from 'sequential-adaptor';

const adapter = await createAdapter('folder', { basePath: './tasks' });
const executor = new TaskExecutor(adapter);
const processor = new StackProcessor(adapter);

const result = await executor.execute(taskRun, taskCode);
```

## Database Schema

- `task_functions` - Published task code
- `task_runs` - Execution instances
- `stack_runs` - Service call chain
- `keystore` - Credentials

## License

MIT
