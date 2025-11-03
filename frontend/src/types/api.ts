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
  originalRowCount?: number;
  truncated?: boolean;
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

export type ContainerType =
  | 'mlb'
  | 'mlb-partner-feedback-helpful'
  | 'mlb-partner-feedback-unhelpful'
  | 'mlb-user-feedback'
  | 'mlb-user-feedback-unhelpful'
  | 'nba-official'
  | 'nba-unofficial';

export interface FeedbackDocument {
  id?: string;
  UserPrompt: string;
  Query: string;
  AssistantPrompt: string;
  UserPromptVector?: number[];
  QueryVector?: number[];
  AssistantPromptVector?: number[];
  _ts?: number;
} 