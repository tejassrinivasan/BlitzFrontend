export interface GenerateInsightsRequest {
  question: string;
  customData?: Record<string, any>;
}

export interface ConversationRequest {
  question: string;
  customData?: Record<string, any>;
}

export interface ApiResponse {
  answer: string;
  sql_query?: string;
  clarification_needed?: boolean;
  clarifying_question?: string;
  error?: string;
}

export interface ApiError {
  error: string;
  message: string;
}

export interface QueryRequest {
  database: string;
  query: string;
}

export interface QueryResult {
  success: boolean;
  data?: any[];
  columns?: string[];
  row_count?: number;
  query?: string;
  database?: string;
  error?: string;
  message?: string;
}

export interface DatabaseInfo {
  databases: string[];
}

export interface ContainerOption {
  value: string;
  label: string;
}

export interface ContainersResponse {
  containers: ContainerOption[];
} 