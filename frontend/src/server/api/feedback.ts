import { Router } from 'express';
import { cosmosService } from '../services/cosmosService';

const router = Router();

// Get documents (official or unofficial)
router.get('/documents', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const isOfficial = req.query.isOfficial === 'true';
    
    const documents = await cosmosService.getDocuments(page, limit, isOfficial);
    res.json(documents);
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// Search documents
router.get('/documents/search', async (req, res) => {
  try {
    const searchTerm = req.query.q as string;
    const isOfficial = req.query.isOfficial === 'true';
    
    if (!searchTerm) {
      return res.status(400).json({ error: 'Search term is required' });
    }
    
    const documents = await cosmosService.searchDocuments(searchTerm, isOfficial);
    res.json(documents);
  } catch (error) {
    console.error('Error searching documents:', error);
    res.status(500).json({ error: 'Failed to search documents' });
  }
});

// Create document
router.post('/documents', async (req, res) => {
  try {
    const isOfficial = req.query.isOfficial === 'true';
    const document = await cosmosService.createDocument(req.body, isOfficial);
    res.json(document);
  } catch (error) {
    console.error('Error creating document:', error);
    res.status(500).json({ error: 'Failed to create document' });
  }
});

// Update document
router.put('/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const isOfficial = req.query.isOfficial === 'true';
    const document = await cosmosService.updateDocument(id, req.body, isOfficial);
    res.json(document);
  } catch (error) {
    console.error('Error updating document:', error);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

// Delete document
router.delete('/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const isOfficial = req.query.isOfficial === 'true';
    await cosmosService.deleteDocument(id, isOfficial);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// Transfer document from unofficial to official
router.post('/documents/:id/transfer', async (req, res) => {
  try {
    const { id } = req.params;
    const document = await cosmosService.transferDocument(id);
    res.json(document);
  } catch (error) {
    console.error('Error transferring document:', error);
    res.status(500).json({ error: 'Failed to transfer document' });
  }
});

export default router; 