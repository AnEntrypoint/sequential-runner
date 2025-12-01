// Public API for @sequential/sequential-runner
// Deployment-agnostic task execution engine with VFS support

// Core VFS classes
const { TaskVFS } = require('../taskcode/vfs.js');
const { HostTools } = require('../taskcode/host-tools.js');

// Named exports for clarity
module.exports = {
  // TaskVFS: Scoped virtual file system for task execution
  // Provides run/task/global scope isolation with file operations
  TaskVFS,

  // HostTools: Host tool interface for task code execution
  // Wraps VFS operations as callable tools within task code
  HostTools
};
