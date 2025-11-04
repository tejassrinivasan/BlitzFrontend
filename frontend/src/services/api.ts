import axios from 'axios';
import type { GenerateInsightsRequest, ConversationRequest, ApiResponse, QueryRequest, QueryResult, DatabaseInfo, ContainersResponse, ContainerType } from '../types/api';

const API_BASE_URL = 'https://blitzfrontend.onrender.com/api';
console.log('🚀 API Base URL:', API_BASE_URL);

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Debug logging for all requests
api.interceptors.request.use(request => {
  console.log('🌐 Making API request to:', (request.baseURL || '') + (request.url || ''));
  return request;
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

// Feedback Documents API
export const getFeedbackDocuments = async (page: number = 1, container: string = 'nba-official') => {
  const response = await api.get(`/feedback/documents?page=${page}&container=${container}`);
  return response.data;
};

export const getAllFeedbackDocuments = async (container: string) => {
  const response = await api.get(`/feedback/documents/all?container=${container}`);
  return response.data;
};

export const searchFeedbackDocuments = async (query: string, container: string, field: string = 'UserPrompt') => {
  const response = await api.get(`/feedback/documents/search?q=${encodeURIComponent(query)}&container=${container}&field=${field}`);
  return response.data;
};

export const createFeedbackDocument = async (document: any, container: string) => {
  const response = await api.post(`/feedback/documents?container=${container}`, document);
  return response.data;
};

export const updateFeedbackDocument = async (docId: string, document: any, container: string) => {
  const response = await api.put(`/feedback/documents/${docId}?container=${container}`, document);
  return response.data;
};

export const deleteFeedbackDocument = async (docId: string, container: string) => {
  const response = await api.delete(`/feedback/documents/${docId}?container=${container}`);
  return response.data;
};

// Container definitions for UI
export const containers: { id: ContainerType; name: string; description: string }[] = [
  { id: 'mlb', name: 'MLB Official', description: 'Official MLB feedback documents' },
  { id: 'mlb-partner-feedback-helpful', name: 'MLB Partner Feedback (Helpful)', description: 'Helpful partner feedback documents' },
  { id: 'mlb-partner-feedback-unhelpful', name: 'MLB Partner Feedback (Unhelpful)', description: 'Unhelpful partner feedback documents' },
  { id: 'mlb-user-feedback', name: 'MLB User Feedback', description: 'User feedback documents' },
  { id: 'mlb-user-feedback-unhelpful', name: 'MLB User Feedback (Unhelpful)', description: 'Unhelpful user feedback documents' },
  { id: 'nba-official', name: 'NBA Official', description: 'Official NBA feedback documents' },
  { id: 'nba-unofficial', name: 'NBA Unofficial', description: 'Unofficial NBA feedback documents' },
]; 