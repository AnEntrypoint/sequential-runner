const { TaskVFS } = require('./vfs.js');

class HostTools {
  constructor(ecosystemPath, taskId, runId) {
    this.vfs = new TaskVFS(ecosystemPath, taskId, runId);
    this.debug = process.env.DEBUG === '1';
    
    this.tools = {
      writeFile: this.writeFile.bind(this),
      readFile: this.readFile.bind(this),
      listFiles: this.listFiles.bind(this),
      deleteFile: this.deleteFile.bind(this),
      fileExists: this.fileExists.bind(this),
      fileStat: this.fileStat.bind(this),
      mkdir: this.mkdir.bind(this),
      watchFile: this.watchFile.bind(this),
      vfsTree: this.vfsTree.bind(this)
    };
  }

  _validateParams(params, required) {
    const missing = required.filter(key => !(key in params));
    if (missing.length > 0) {
      throw new Error(`Missing required parameters: ${missing.join(', ')}`);
    }
  }

  async writeFile(params) {
    this._validateParams(params, ['path', 'content']);
    
    const { path, content, scope = 'run', encoding = 'utf8', append = false } = params;
    
    try {
      return await this.vfs.writeFile(path, content, scope, { encoding, append });
    } catch (error) {
      return {
        success: false,
        error: error.message,
        tool: 'writeFile',
        params: { path, scope }
      };
    }
  }

  async readFile(params) {
    this._validateParams(params, ['path']);
    
    const { path, scope = 'auto', encoding = 'utf8' } = params;
    
    try {
      return await this.vfs.readFile(path, scope, { encoding });
    } catch (error) {
      return {
        success: false,
        error: error.message,
        tool: 'readFile',
        params: { path, scope }
      };
    }
  }

  async listFiles(params = {}) {
    const { path = '/', scope = 'run', recursive = false } = params;
    
    try {
      const result = await this.vfs.listFiles(path, scope);
      
      if (recursive && result.directories.length > 0) {
        for (const dir of result.directories) {
          const subResult = await this.listFiles({ 
            path: dir.path, 
            scope, 
            recursive: true 
          });
          if (subResult.success) {
            result.files.push(...subResult.files);
            result.directories.push(...subResult.directories);
          }
        }
      }
      
      return { ...result, success: true };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        tool: 'listFiles',
        params: { path, scope }
      };
    }
  }

  async deleteFile(params) {
    this._validateParams(params, ['path']);
    
    const { path, scope = 'run' } = params;
    
    try {
      return await this.vfs.deleteFile(path, scope);
    } catch (error) {
      return {
        success: false,
        error: error.message,
        tool: 'deleteFile',
        params: { path, scope }
      };
    }
  }

  async fileExists(params) {
    this._validateParams(params, ['path']);
    
    const { path, scope = 'run' } = params;
    
    try {
      const exists = await this.vfs.exists(path, scope);
      return { success: true, exists, path, scope };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        tool: 'fileExists',
        params: { path, scope }
      };
    }
  }

  async fileStat(params) {
    this._validateParams(params, ['path']);
    
    const { path, scope = 'run' } = params;
    
    try {
      return await this.vfs.stat(path, scope);
    } catch (error) {
      return {
        success: false,
        error: error.message,
        tool: 'fileStat',
        params: { path, scope }
      };
    }
  }

  async mkdir(params) {
    this._validateParams(params, ['path']);
    
    const { path, scope = 'run' } = params;
    
    try {
      return await this.vfs.mkdir(path, scope);
    } catch (error) {
      return {
        success: false,
        error: error.message,
        tool: 'mkdir',
        params: { path, scope }
      };
    }
  }

  async watchFile(params) {
    this._validateParams(params, ['path']);
    
    const { path, scope = 'run' } = params;
    
    try {
      return await new Promise((resolve) => {
        this.vfs.watch(path, scope, (event) => {
          resolve({ success: true, event, path, scope });
        });
      });
    } catch (error) {
      return {
        success: false,
        error: error.message,
        tool: 'watchFile',
        params: { path, scope }
      };
    }
  }

  vfsTree() {
    try {
      const tree = this.vfs.getVFSTree();
      return { success: true, tree };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        tool: 'vfsTree'
      };
    }
  }

  getTool(toolName) {
    if (!this.tools[toolName]) {
      throw new Error(`Unknown host tool: ${toolName}. Available: ${Object.keys(this.tools).join(', ')}`);
    }
    return this.tools[toolName];
  }

  getVFS() {
    return this.vfs;
  }

  getAvailableTools() {
    return Object.keys(this.tools).map(name => ({
      name,
      description: this._getToolDescription(name)
    }));
  }

  _getToolDescription(name) {
    const descriptions = {
      writeFile: 'Write content to a file (params: path, content, scope?, encoding?, append?)',
      readFile: 'Read content from a file (params: path, scope?, encoding?)',
      listFiles: 'List files in a directory (params: path?, scope?, recursive?)',
      deleteFile: 'Delete a file or directory (params: path, scope?)',
      fileExists: 'Check if a file exists (params: path, scope?)',
      fileStat: 'Get file metadata (params: path, scope?)',
      mkdir: 'Create a directory (params: path, scope?)',
      watchFile: 'Watch a file for changes (params: path, scope?)',
      vfsTree: 'Get VFS directory tree (no params)'
    };
    return descriptions[name] || 'No description available';
  }
}

module.exports = { HostTools };
