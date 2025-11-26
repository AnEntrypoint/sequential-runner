const { TaskVFS } = require('./vfs.js');

class HostTools {
  constructor(ecosystemPath, taskId, runId) {
    this.vfs = new TaskVFS(ecosystemPath, taskId, runId);
    
    this.tools = {
      writeFile: this.writeFile.bind(this),
      readFile: this.readFile.bind(this),
      listFiles: this.listFiles.bind(this),
      deleteFile: this.deleteFile.bind(this),
      fileExists: this.fileExists.bind(this),
      fileStat: this.fileStat.bind(this),
      watchFile: this.watchFile.bind(this)
    };
  }

  async writeFile(params) {
    const { path, content, scope = 'run', encoding = 'utf8' } = params;
    
    if (!path) {
      throw new Error('writeFile requires path parameter');
    }

    return await this.vfs.writeFile(path, content, scope, { encoding });
  }

  async readFile(params) {
    const { path, scope = 'auto', encoding = 'utf8' } = params;
    
    if (!path) {
      throw new Error('readFile requires path parameter');
    }

    return await this.vfs.readFile(path, scope, { encoding });
  }

  async listFiles(params) {
    const { path = '/', scope = 'run' } = params;
    return await this.vfs.listFiles(path, scope);
  }

  async deleteFile(params) {
    const { path, scope = 'run' } = params;
    
    if (!path) {
      throw new Error('deleteFile requires path parameter');
    }

    return await this.vfs.deleteFile(path, scope);
  }

  async fileExists(params) {
    const { path, scope = 'run' } = params;
    
    if (!path) {
      throw new Error('fileExists requires path parameter');
    }

    return await this.vfs.exists(path, scope);
  }

  async fileStat(params) {
    const { path, scope = 'run' } = params;
    
    if (!path) {
      throw new Error('fileStat requires path parameter');
    }

    return await this.vfs.stat(path, scope);
  }

  async watchFile(params) {
    const { path, scope = 'run' } = params;
    
    if (!path) {
      throw new Error('watchFile requires path parameter');
    }

    return new Promise((resolve) => {
      this.vfs.watch(path, scope, (event) => {
        resolve(event);
      });
    });
  }

  getTool(toolName) {
    return this.tools[toolName];
  }

  getVFS() {
    return this.vfs;
  }
}

module.exports = { HostTools };
