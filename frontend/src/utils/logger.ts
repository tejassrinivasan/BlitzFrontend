interface LogEntry {
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  category: string;
  message: string;
  data?: any;
  requestId?: string;
}

class Logger {
  private static instance: Logger;
  private logs: LogEntry[] = [];
  private maxLogs = 1000; // Keep last 1000 logs
  
  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private generateRequestId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private addLog(entry: LogEntry) {
    this.logs.push(entry);
    
    // Keep only the last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Store in localStorage for persistence
    try {
      localStorage.setItem('blitz_logs', JSON.stringify(this.logs.slice(-100))); // Store last 100
    } catch (e) {
      // Ignore localStorage errors
    }
  }

  debug(category: string, message: string, data?: any, requestId?: string) {
    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level: 'DEBUG',
      category,
      message,
      data,
      requestId
    };
    
    this.addLog(entry);
    
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[${entry.timestamp}] [${category}] ${message}`, data || '');
    }
  }

  info(category: string, message: string, data?: any, requestId?: string) {
    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level: 'INFO',
      category,
      message,
      data,
      requestId
    };
    
    this.addLog(entry);
    console.info(`[${entry.timestamp}] [${category}] ${message}`, data || '');
  }

  warn(category: string, message: string, data?: any, requestId?: string) {
    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level: 'WARN',
      category,
      message,
      data,
      requestId
    };
    
    this.addLog(entry);
    console.warn(`[${entry.timestamp}] [${category}] ${message}`, data || '');
  }

  error(category: string, message: string, error?: any, requestId?: string) {
    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level: 'ERROR',
      category,
      message,
      data: error,
      requestId
    };
    
    this.addLog(entry);
    console.error(`[${entry.timestamp}] [${category}] ${message}`, error || '');
  }

  // API-specific logging methods
  logApiRequest(method: string, url: string, data?: any): string {
    const requestId = this.generateRequestId();
    
    this.info('API_REQUEST', `${method.toUpperCase()} ${url}`, {
      method,
      url,
      requestData: data,
      userAgent: navigator.userAgent,
      timestamp: this.formatTimestamp()
    }, requestId);
    
    return requestId;
  }

  logApiResponse(requestId: string, method: string, url: string, status: number, response?: any, duration?: number) {
    this.info('API_RESPONSE', `${method.toUpperCase()} ${url} - ${status}`, {
      method,
      url,
      status,
      responseData: response,
      duration: duration ? `${duration}ms` : undefined,
      timestamp: this.formatTimestamp()
    }, requestId);
  }

  logApiError(requestId: string, method: string, url: string, error: any) {
    this.error('API_ERROR', `${method.toUpperCase()} ${url} - Failed`, {
      method,
      url,
      error: error.message || error,
      status: error.response?.status,
      statusText: error.response?.statusText,
      responseData: error.response?.data,
      timestamp: this.formatTimestamp()
    }, requestId);
  }

  // Get logs for debugging
  getLogs(level?: LogEntry['level']): LogEntry[] {
    if (level) {
      return this.logs.filter(log => log.level === level);
    }
    return [...this.logs];
  }

  // Clear logs
  clearLogs() {
    this.logs = [];
    localStorage.removeItem('blitz_logs');
    this.info('LOGGER', 'Logs cleared');
  }

  // Export logs as JSON
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  // Load logs from localStorage on initialization
  loadPersistedLogs() {
    try {
      const savedLogs = localStorage.getItem('blitz_logs');
      if (savedLogs) {
        const parsedLogs = JSON.parse(savedLogs);
        if (Array.isArray(parsedLogs)) {
          this.logs = parsedLogs;
        }
      }
    } catch (e) {
      console.warn('Failed to load persisted logs:', e);
    }
  }
}

// Initialize and load persisted logs
const logger = Logger.getInstance();
logger.loadPersistedLogs();

export default logger; 