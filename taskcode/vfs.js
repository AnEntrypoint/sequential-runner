const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

class TaskVFS extends EventEmitter {
  constructor(ecosystemPath, taskId, runId) {
    super();
    this.ecosystemPath = ecosystemPath;
    this.taskId = taskId;
    this.runId = runId;
    
    this.scopes = {
      run: path.join(ecosystemPath, 'tasks', taskId, 'runs', runId, 'fs'),
      task: path.join(ecosystemPath, 'tasks', taskId, 'fs'),
      global: path.join(ecosystemPath, 'vfs', 'global')
    };

    this._ensureDirectories();
  }

  _ensureDirectories() {
    Object.values(this.scopes).forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  _resolvePath(filepath, scope = 'run') {
    if (!this.scopes[scope]) {
      throw new Error(`Invalid scope: ${scope}. Must be run, task, or global`);
    }
    
    const normalized = filepath.startsWith('/') ? filepath.slice(1) : filepath;
    const resolved = path.join(this.scopes[scope], normalized);
    
    if (!resolved.startsWith(this.scopes[scope])) {
      throw new Error('Path traversal detected');
    }
    
    return resolved;
  }

  async writeFile(filepath, content, scope = 'run', options = {}) {
    const fullPath = this._resolvePath(filepath, scope);
    const dir = path.dirname(fullPath);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const encoding = options.encoding || 'utf8';
    
    if (typeof content === 'object' && !Buffer.isBuffer(content)) {
      content = JSON.stringify(content, null, 2);
    }

    await fs.promises.writeFile(fullPath, content, encoding);

    const stat = await fs.promises.stat(fullPath);
    
    this.emit('file:write', {
      path: filepath,
      scope,
      fullPath,
      size: stat.size,
      timestamp: new Date().toISOString()
    });

    return {
      success: true,
      path: filepath,
      scope,
      size: stat.size
    };
  }

  async readFile(filepath, scope = 'run', options = {}) {
    const searchScopes = scope === 'auto' ? ['run', 'task', 'global'] : [scope];
    
    for (const s of searchScopes) {
      try {
        const fullPath = this._resolvePath(filepath, s);
        
        if (!fs.existsSync(fullPath)) {
          continue;
        }

        const encoding = options.encoding || 'utf8';
        const content = await fs.promises.readFile(fullPath, encoding);
        const stat = await fs.promises.stat(fullPath);

        this.emit('file:read', {
          path: filepath,
          scope: s,
          fullPath,
          size: stat.size,
          timestamp: new Date().toISOString()
        });

        return {
          success: true,
          content,
          path: filepath,
          scope: s,
          size: stat.size,
          modified: stat.mtime
        };
      } catch (e) {
        if (scope !== 'auto') throw e;
      }
    }

    throw new Error(`File not found: ${filepath}`);
  }

  async listFiles(dirpath = '/', scope = 'run', options = {}) {
    const fullPath = this._resolvePath(dirpath, scope);
    
    if (!fs.existsSync(fullPath)) {
      return { files: [], directories: [] };
    }

    const entries = await fs.promises.readdir(fullPath, { withFileTypes: true });
    const files = [];
    const directories = [];

    for (const entry of entries) {
      const entryPath = path.join(dirpath, entry.name);
      const entryFullPath = path.join(fullPath, entry.name);
      const stat = await fs.promises.stat(entryFullPath);

      const item = {
        name: entry.name,
        path: entryPath,
        scope,
        size: stat.size,
        modified: stat.mtime,
        created: stat.birthtime
      };

      if (entry.isDirectory()) {
        directories.push(item);
      } else {
        files.push(item);
      }
    }

    return { files, directories };
  }

  async deleteFile(filepath, scope = 'run') {
    const fullPath = this._resolvePath(filepath, scope);
    
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${filepath}`);
    }

    await fs.promises.unlink(fullPath);

    this.emit('file:delete', {
      path: filepath,
      scope,
      fullPath,
      timestamp: new Date().toISOString()
    });

    return { success: true, path: filepath, scope };
  }

  async exists(filepath, scope = 'run') {
    try {
      const fullPath = this._resolvePath(filepath, scope);
      return fs.existsSync(fullPath);
    } catch {
      return false;
    }
  }

  async stat(filepath, scope = 'run') {
    const fullPath = this._resolvePath(filepath, scope);
    const stat = await fs.promises.stat(fullPath);
    
    return {
      path: filepath,
      scope,
      size: stat.size,
      modified: stat.mtime,
      created: stat.birthtime,
      isDirectory: stat.isDirectory(),
      isFile: stat.isFile()
    };
  }

  async watch(filepath, scope = 'run', callback) {
    const fullPath = this._resolvePath(filepath, scope);
    
    const watcher = fs.watch(fullPath, { recursive: false }, (eventType, filename) => {
      callback({
        event: eventType,
        filename,
        path: filepath,
        scope,
        timestamp: new Date().toISOString()
      });
    });

    return {
      close: () => watcher.close()
    };
  }

  getVFSTree() {
    const tree = {};
    
    for (const [scopeName, scopePath] of Object.entries(this.scopes)) {
      tree[scopeName] = {
        path: scopePath,
        exists: fs.existsSync(scopePath)
      };
    }

    return tree;
  }

  async exportToOSjs(osJsVFSPath) {
    const exportPath = path.join(osJsVFSPath, 'tasks', this.taskId);
    
    if (!fs.existsSync(exportPath)) {
      fs.mkdirSync(exportPath, { recursive: true });
    }

    for (const [scopeName, scopePath] of Object.entries(this.scopes)) {
      const targetPath = path.join(exportPath, scopeName);
      
      if (fs.existsSync(scopePath)) {
        await this._copyDirectory(scopePath, targetPath);
      }
    }

    return { success: true, exportPath };
  }

  async _copyDirectory(src, dest) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const entries = await fs.promises.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this._copyDirectory(srcPath, destPath);
      } else {
        await fs.promises.copyFile(srcPath, destPath);
      }
    }
  }
}

module.exports = { TaskVFS };
