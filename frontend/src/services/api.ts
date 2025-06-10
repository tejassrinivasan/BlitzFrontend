import axios from 'axios';
import type { GenerateInsightsRequest, ConversationRequest, ApiResponse } from '../types/api';

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