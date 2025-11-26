const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

class TaskVFS extends EventEmitter {
  constructor(ecosystemPath, taskId, runId) {
    super();
    this.ecosystemPath = ecosystemPath;
    this.taskId = taskId;
    this.runId = runId;
    this.debug = process.env.DEBUG === '1';
    
    this.scopes = {
      run: path.join(ecosystemPath, 'tasks', taskId, 'runs', runId, 'fs'),
      task: path.join(ecosystemPath, 'tasks', taskId, 'fs'),
      global: path.join(ecosystemPath, 'vfs', 'global')
    };

    this._ensureDirectories();
    this._log('VFS initialized', { taskId, runId, scopes: this.scopes });
  }

  _log(message, data = {}) {
    if (this.debug) {
      console.log(`[TaskVFS] ${message}`, data);
    }
  }

  _ensureDirectories() {
    Object.entries(this.scopes).forEach(([scopeName, dir]) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        this._log(`Created scope directory: ${scopeName}`, { dir });
      }
    });
  }

  _resolvePath(filepath, scope = 'run') {
    if (!this.scopes[scope]) {
      const validScopes = Object.keys(this.scopes).join(', ');
      throw new Error(`Invalid scope: ${scope}. Valid scopes: ${validScopes}`);
    }
    
    if (!filepath || filepath.trim() === '') {
      throw new Error('Filepath cannot be empty');
    }
    
    const normalized = filepath.startsWith('/') ? filepath.slice(1) : filepath;
    const resolved = path.join(this.scopes[scope], normalized);
    
    if (!resolved.startsWith(this.scopes[scope])) {
      throw new Error(`Path traversal detected: ${filepath}`);
    }
    
    return resolved;
  }

  async writeFile(filepath, content, scope = 'run', options = {}) {
    try {
      const fullPath = this._resolvePath(filepath, scope);
      const dir = path.dirname(fullPath);
      
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const encoding = options.encoding || 'utf8';
      
      if (typeof content === 'object' && !Buffer.isBuffer(content)) {
        content = JSON.stringify(content, null, 2);
      }

      if (options.append && fs.existsSync(fullPath)) {
        const existing = await fs.promises.readFile(fullPath, encoding);
        content = existing + content;
      }

      await fs.promises.writeFile(fullPath, content, encoding);
      const stat = await fs.promises.stat(fullPath);
      
      const event = {
        path: filepath,
        scope,
        fullPath,
        size: stat.size,
        timestamp: new Date().toISOString()
      };

      this.emit('file:write', event);
      this._log('File written', event);

      return {
        success: true,
        path: filepath,
        scope,
        size: stat.size,
        fullPath
      };
    } catch (error) {
      this._log('Write error', { filepath, scope, error: error.message });
      throw new Error(`Failed to write file ${filepath}: ${error.message}`);
    }
  }

  async readFile(filepath, scope = 'run', options = {}) {
    const searchScopes = scope === 'auto' ? ['run', 'task', 'global'] : [scope];
    const errors = [];
    
    for (const s of searchScopes) {
      try {
        const fullPath = this._resolvePath(filepath, s);
        
        if (!fs.existsSync(fullPath)) {
          errors.push(`Not found in ${s} scope`);
          continue;
        }

        const encoding = options.encoding || 'utf8';
        const content = await fs.promises.readFile(fullPath, encoding);
        const stat = await fs.promises.stat(fullPath);

        const event = {
          path: filepath,
          scope: s,
          fullPath,
          size: stat.size,
          timestamp: new Date().toISOString()
        };

        this.emit('file:read', event);
        this._log('File read', event);

        return {
          success: true,
          content,
          path: filepath,
          scope: s,
          size: stat.size,
          modified: stat.mtime,
          fullPath
        };
      } catch (e) {
        errors.push(`${s}: ${e.message}`);
        if (scope !== 'auto') {
          throw new Error(`Failed to read file ${filepath}: ${e.message}`);
        }
      }
    }

    throw new Error(`File not found: ${filepath}. Searched: ${errors.join(', ')}`);
  }

  async listFiles(dirpath = '/', scope = 'run', options = {}) {
    try {
      const fullPath = this._resolvePath(dirpath, scope);
      
      if (!fs.existsSync(fullPath)) {
        return { 
          path: dirpath,
          scope,
          files: [], 
          directories: [],
          total: 0
        };
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
          created: stat.birthtime,
          fullPath: entryFullPath
        };

        if (entry.isDirectory()) {
          directories.push(item);
        } else {
          item.extension = path.extname(entry.name);
          files.push(item);
        }
      }

      this._log('Listed files', { dirpath, scope, fileCount: files.length, dirCount: directories.length });

      return { 
        path: dirpath,
        scope,
        files, 
        directories,
        total: files.length + directories.length
      };
    } catch (error) {
      throw new Error(`Failed to list files in ${dirpath}: ${error.message}`);
    }
  }

  async deleteFile(filepath, scope = 'run') {
    try {
      const fullPath = this._resolvePath(filepath, scope);
      
      if (!fs.existsSync(fullPath)) {
        throw new Error(`File not found: ${filepath}`);
      }

      const stat = await fs.promises.stat(fullPath);
      
      if (stat.isDirectory()) {
        await fs.promises.rm(fullPath, { recursive: true, force: true });
      } else {
        await fs.promises.unlink(fullPath);
      }

      const event = {
        path: filepath,
        scope,
        fullPath,
        timestamp: new Date().toISOString()
      };

      this.emit('file:delete', event);
      this._log('File deleted', event);

      return { success: true, path: filepath, scope };
    } catch (error) {
      throw new Error(`Failed to delete ${filepath}: ${error.message}`);
    }
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
    try {
      const fullPath = this._resolvePath(filepath, scope);
      
      if (!fs.existsSync(fullPath)) {
        throw new Error(`File not found: ${filepath}`);
      }

      const stat = await fs.promises.stat(fullPath);
      
      return {
        path: filepath,
        scope,
        size: stat.size,
        modified: stat.mtime,
        created: stat.birthtime,
        accessed: stat.atime,
        isDirectory: stat.isDirectory(),
        isFile: stat.isFile(),
        fullPath
      };
    } catch (error) {
      throw new Error(`Failed to stat ${filepath}: ${error.message}`);
    }
  }

  async mkdir(dirpath, scope = 'run') {
    try {
      const fullPath = this._resolvePath(dirpath, scope);
      await fs.promises.mkdir(fullPath, { recursive: true });
      
      this._log('Directory created', { dirpath, scope, fullPath });
      
      return { success: true, path: dirpath, scope, fullPath };
    } catch (error) {
      throw new Error(`Failed to create directory ${dirpath}: ${error.message}`);
    }
  }

  watch(filepath, scope = 'run', callback) {
    try {
      const fullPath = this._resolvePath(filepath, scope);
      
      if (!fs.existsSync(fullPath)) {
        throw new Error(`Cannot watch non-existent path: ${filepath}`);
      }

      this._log('Watching file', { filepath, scope, fullPath });

      const watcher = fs.watch(fullPath, { recursive: false }, (eventType, filename) => {
        const event = {
          event: eventType,
          filename,
          path: filepath,
          scope,
          timestamp: new Date().toISOString()
        };
        this._log('File change detected', event);
        callback(event);
      });

      return {
        close: () => {
          watcher.close();
          this._log('Watcher closed', { filepath, scope });
        }
      };
    } catch (error) {
      throw new Error(`Failed to watch ${filepath}: ${error.message}`);
    }
  }

  getVFSTree() {
    const tree = {};
    
    for (const [scopeName, scopePath] of Object.entries(this.scopes)) {
      tree[scopeName] = {
        path: scopePath,
        exists: fs.existsSync(scopePath),
        size: this._getDirectorySize(scopePath)
      };
    }

    return tree;
  }

  _getDirectorySize(dirPath) {
    if (!fs.existsSync(dirPath)) return 0;
    
    let size = 0;
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const item of items) {
      const itemPath = path.join(dirPath, item.name);
      if (item.isDirectory()) {
        size += this._getDirectorySize(itemPath);
      } else {
        const stat = fs.statSync(itemPath);
        size += stat.size;
      }
    }
    
    return size;
  }

  async exportToOSjs(osJsVFSPath) {
    try {
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

      this._log('Exported to OS.js', { exportPath });

      return { success: true, exportPath };
    } catch (error) {
      throw new Error(`Failed to export to OS.js: ${error.message}`);
    }
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
