import axios from 'axios';
import type { GenerateInsightsRequest, ConversationRequest, ApiResponse, QueryRequest, QueryResult, DatabaseInfo, ContainersResponse } from '../types/api';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

export const generateInsights = async (request: GenerateInsightsRequest): Promise<ApiResponse> => {
  const response = await api.post<ApiResponse>('/generate-insights', request);
  return response.data;
};

export const startConversation = async (request: ConversationRequest): Promise<ApiResponse> => {
  const response = await api.post<ApiResponse>('/conversation', request);
  return response.data;
};

// PostgreSQL Database Query APIs
export const getAvailableDatabases = async (): Promise<DatabaseInfo> => {
  const response = await api.get<DatabaseInfo>('/databases');
  return response.data;
};

export const executeQuery = async (request: QueryRequest): Promise<QueryResult> => {
  const response = await api.post<QueryResult>('/query', request);
  return response.data;
};

export const testDatabaseConnection = async (database: string): Promise<{ success: boolean; error?: string }> => {
  const response = await api.get(`/databases/${database}/test`);
  return response.data;
};

export const getDatabaseTables = async (database: string): Promise<QueryResult> => {
  const response = await api.get(`/databases/${database}/tables`);
  return response.data;
};

// Feedback Containers API
export const getFeedbackContainers = async (): Promise<ContainersResponse> => {
  const response = await api.get<ContainersResponse>('/feedback/containers');
  return response.data;
}; 