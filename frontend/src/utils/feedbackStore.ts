import { v4 as uuidv4 } from 'uuid';

export interface FeedbackDocument {
  id: string;
  UserPrompt: string;
  Query: string;
  timestamp: number;
  isOfficial: boolean;
}

const STORAGE_KEY = 'blitz_feedback_documents';

export function getAllDocuments(page: number = 1, limit: number = 20, isOfficial: boolean = false): FeedbackDocument[] {
  try {
    const allDocs = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as FeedbackDocument[];
    const filteredDocs = allDocs
      .filter(doc => doc.isOfficial === isOfficial)
      .sort((a, b) => b.timestamp - a.timestamp);
    
    const start = (page - 1) * limit;
    const end = start + limit;
    return filteredDocs.slice(start, end);
  } catch (error) {
    console.error('Error fetching documents:', error);
    return [];
  }
}

export function searchDocuments(query: string, isOfficial: boolean = false): FeedbackDocument[] {
  try {
    const allDocs = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as FeedbackDocument[];
    const searchTerm = query.toLowerCase();
    
    return allDocs
      .filter(doc => 
        doc.isOfficial === isOfficial &&
        (doc.UserPrompt.toLowerCase().includes(searchTerm) ||
         doc.Query.toLowerCase().includes(searchTerm))
      )
      .sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error('Error searching documents:', error);
    return [];
  }
}

export function createDocument(doc: Omit<FeedbackDocument, 'id' | 'timestamp'>): FeedbackDocument {
  try {
    const allDocs = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as FeedbackDocument[];
    
    const newDoc: FeedbackDocument = {
      ...doc,
      id: uuidv4(),
      timestamp: Date.now()
    };
    
    allDocs.push(newDoc);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allDocs));
    
    return newDoc;
  } catch (error) {
    console.error('Error creating document:', error);
    throw new Error('Failed to create document');
  }
}

export function updateDocument(id: string, updates: Partial<FeedbackDocument>): FeedbackDocument {
  try {
    const allDocs = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as FeedbackDocument[];
    const docIndex = allDocs.findIndex(doc => doc.id === id);
    
    if (docIndex === -1) {
      throw new Error('Document not found');
    }
    
    const updatedDoc = {
      ...allDocs[docIndex],
      ...updates,
      timestamp: Date.now() // Update timestamp on changes
    };
    
    allDocs[docIndex] = updatedDoc;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allDocs));
    
    return updatedDoc;
  } catch (error) {
    console.error('Error updating document:', error);
    throw new Error('Failed to update document');
  }
}

export function deleteDocument(id: string): void {
  try {
    const allDocs = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as FeedbackDocument[];
    const filteredDocs = allDocs.filter(doc => doc.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filteredDocs));
  } catch (error) {
    console.error('Error deleting document:', error);
    throw new Error('Failed to delete document');
  }
}

export function transferDocument(id: string): FeedbackDocument {
  try {
    const allDocs = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as FeedbackDocument[];
    const docIndex = allDocs.findIndex(doc => doc.id === id);
    
    if (docIndex === -1) {
      throw new Error('Document not found');
    }
    
    // Toggle the isOfficial status
    const updatedDoc = {
      ...allDocs[docIndex],
      isOfficial: true,
      timestamp: Date.now()
    };
    
    allDocs[docIndex] = updatedDoc;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allDocs));
    
    return updatedDoc;
  } catch (error) {
    console.error('Error transferring document:', error);
    throw new Error('Failed to transfer document');
  }
}

export function getTotalDocuments(isOfficial: boolean = false): number {
  try {
    const allDocs = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as FeedbackDocument[];
    return allDocs.filter(doc => doc.isOfficial === isOfficial).length;
  } catch (error) {
    console.error('Error getting total documents:', error);
    return 0;
  }
} 