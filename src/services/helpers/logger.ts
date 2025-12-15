import fs from 'fs/promises';
import path from 'path';

interface LogEntry {
  timestamp: string;
  helper: string;
  type: 'USER_MESSAGE' | 'SYSTEM_PROMPT' | 'TOOL_CALL' | 'TOOL_RESULT' | 'ASSISTANT_RESPONSE' | 'ERROR';
  content: any;
  sessionId: string;
}

const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'helper-interactions.log');

class HelperLogger {
  private sessionId: string;
  private logDirEnsured = false;

  constructor() {
    this.sessionId = Date.now().toString();
  }

  private async ensureLogDir() {
    if (this.logDirEnsured) return;
    try {
      await fs.mkdir(LOG_DIR, { recursive: true });
      this.logDirEnsured = true;
    } catch (error) {
      console.error('Failed to create log directory:', error);
    }
  }

  private async writeLog(entry: LogEntry) {
    try {
      await this.ensureLogDir();
      const logLine = JSON.stringify(entry) + '\n';
      await fs.appendFile(LOG_FILE, logLine);
    } catch (error) {
      console.error('Failed to write log:', error);
    }
  }

  logUserMessage(helper: string, messages: any[], openTabs: any[], activeTabId: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      helper,
      type: 'USER_MESSAGE',
      content: { 
        lastMessage: messages[messages.length - 1],
        messageCount: messages.length,
        openTabIds: openTabs.map(t => t.id),
        activeTabId
      },
      sessionId: this.sessionId
    };
    this.writeLog(entry);
    console.log(`✓ [${helper}] Request received`);
  }

  logSystemPrompt(helper: string, systemPrompt: string, cacheHit: boolean) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      helper,
      type: 'SYSTEM_PROMPT',
      content: { 
        systemPrompt,
        cacheHit
      },
      sessionId: this.sessionId
    };
    this.writeLog(entry);
  }

  logToolCall(helper: string, toolName: string, parameters: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      helper,
      type: 'TOOL_CALL',
      content: { toolName, parameters },
      sessionId: this.sessionId
    };
    this.writeLog(entry);
  }

  logToolResult(helper: string, toolName: string, result: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      helper,
      type: 'TOOL_RESULT',
      content: { 
        toolName, 
        result
      },
      sessionId: this.sessionId
    };
    this.writeLog(entry);
  }

  logAssistantResponse(helper: string, response: string) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      helper,
      type: 'ASSISTANT_RESPONSE',
      content: { response },
      sessionId: this.sessionId
    };
    this.writeLog(entry);
  }

  logError(helper: string, error: Error | string) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      helper,
      type: 'ERROR',
      content: error instanceof Error ? { 
        message: error.message, 
        stack: error.stack 
      } : { message: error },
      sessionId: this.sessionId
    };
    this.writeLog(entry);
    console.error(`❌ [${helper}] Error occurred`);
  }
}

export const helperLogger = new HelperLogger();
