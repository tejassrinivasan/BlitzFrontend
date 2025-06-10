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