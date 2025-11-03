import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  Container,
  Flex,
  Heading,
  Stack,
  Text,
  Textarea,
  useToast,
  Card,
  CardBody,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  ButtonGroup,
  Select,
  FormControl,
  FormLabel,
  Spinner,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Checkbox,
  Radio,
  RadioGroup,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Highlight,
  useDisclosure,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
} from '@chakra-ui/react';
import { SearchIcon, EditIcon, DeleteIcon, ArrowUpIcon, RepeatIcon, ChevronRightIcon, ArrowBackIcon } from '@chakra-ui/icons';
import debounce from 'lodash/debounce';
import { FeedbackDocument } from '../server/services/cosmosService';
import { executeQuery } from '../services/api';
import type { QueryResult } from '../types/api';

type ContainerType = 
  | 'mlb'
  | 'mlb-unofficial'
  | 'nba-official'
  | 'nba-unofficial';

interface ContainerOption {
  value: string;
  label: string;
}

type BulkEditField = 'UserPrompt' | 'Query';

interface BulkEditPreview {
  id: string;
  field: BulkEditField;
  oldValue: string;
  newValue: string;
  selected: boolean;
}

function FeedbackDocuments() {
  const [documents, setDocuments] = useState<FeedbackDocument[]>([]);
  const [editingDoc, setEditingDoc] = useState<FeedbackDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContainer, setSelectedContainer] = useState<ContainerType>('nba-official');
  const [containers, setContainers] = useState<ContainerOption[]>([]);
  const toast = useToast();
  const [switchingContainer, setSwitchingContainer] = useState(false);
  const { isOpen: isBulkEditOpen, onOpen: onBulkEditOpen, onClose: onBulkEditClose } = useDisclosure();
  const [bulkEditField, setBulkEditField] = useState<BulkEditField>('Query');
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [previewChanges, setPreviewChanges] = useState<BulkEditPreview[]>([]);
  const [selectAll, setSelectAll] = useState(true);
  const [matchedDocuments, setMatchedDocuments] = useState<FeedbackDocument[]>([]);
  const [showingResults, setShowingResults] = useState<Set<string>>(new Set());
  const [queryResults, setQueryResults] = useState<Record<string, QueryResult>>(() => {
    // Load cached results from localStorage on component mount
    try {
      const cached = localStorage.getItem('feedbackDocuments_queryResults');
      return cached ? JSON.parse(cached) : {};
    } catch {
      return {};
    }
  });
  const [selectedDatabases, setSelectedDatabases] = useState<Record<string, string>>(() => {
    // Load selected databases from localStorage
    try {
      const cached = localStorage.getItem('feedbackDocuments_selectedDatabases');
      return cached ? JSON.parse(cached) : {};
    } catch {
      return {};
    }
  });
  const [queryLoading, setQueryLoading] = useState<Set<string>>(new Set());
  const [tablePage, setTablePage] = useState<Record<string, number>>({});
  const [tablePageSize] = useState(50); // Show 50 rows per page in table
  const [showAllMode, setShowAllMode] = useState(false);
  const [loadingAllDocuments, setLoadingAllDocuments] = useState(false);
  const [documentCache, setDocumentCache] = useState<Record<string, FeedbackDocument[]>>(() => {
    // Load document cache from localStorage
    try {
      const cached = localStorage.getItem('feedbackDocuments_documentCache');
      return cached ? JSON.parse(cached) : {};
    } catch {
      return {};
    }
  });
  const [preloadingContainers, setPreloadingContainers] = useState<Set<string>>(new Set());

  const loadContainers = async () => {
    try {
      const response = await fetch('/api/feedback/containers');
      if (!response.ok) {
        throw new Error('Failed to load containers');
      }
      const data = await response.json();
      setContainers(data.containers);
    } catch (error) {
      console.error('Error loading containers:', error);
      // Fallback to default containers
      setContainers([
        { value: 'mlb', label: 'MLB Official' },
        { value: 'mlb-unofficial', label: 'MLB Unofficial' },
        { value: 'nba-official', label: 'NBA Official' },
        { value: 'nba-unofficial', label: 'NBA Unofficial' }
      ]);
    }
  };

  const fetchDocuments = async (pageNum: number = 1, search: string = '') => {
    try {
      setLoading(true);
      
      // For page 1 non-search requests, check if we have cached documents
      if (pageNum === 1 && !search && documentCache[selectedContainer] && documentCache[selectedContainer].length > 0) {
        const cachedDocs = documentCache[selectedContainer];
        setDocuments(cachedDocs.slice(0, 20)); // Show first page from cache
        setHasMore(cachedDocs.length > 20);
        setPage(1);
        setLoading(false);
        setSwitchingContainer(false);
        
        // If we have a large cache, we can also show "show all" immediately
        if (cachedDocs.length > 20) {
          toast({
            title: 'Documents loaded from cache',
            description: `${cachedDocs.length} documents available locally`,
            status: 'success',
            duration: 2000,
            isClosable: true,
          });
        }
        return;
      }
      
      const endpoint = search
        ? `/api/feedback/documents/search?q=${encodeURIComponent(search)}&container=${selectedContainer}`
        : `/api/feedback/documents?page=${pageNum}&container=${selectedContainer}`;
      
      const response = await fetch(endpoint);
      
      if (!response.ok) {
        throw new Error('Failed to fetch documents');
      }

      const data = await response.json();
      
      if (pageNum === 1) {
        setDocuments(data);
        
        // Update cache for non-search requests
        if (!search) {
          setDocumentCache(prev => ({
            ...prev,
            [selectedContainer]: data
          }));
        }
      } else {
        setDocuments(prev => {
          const newDocs = [...prev, ...data];
          
          // Update cache with new documents for non-search requests
          if (!search) {
            setDocumentCache(prev => ({
              ...prev,
              [selectedContainer]: newDocs
            }));
          }
          
          return newDocs;
        });
      }
      
      setHasMore(data.length === 20);
      setPage(pageNum);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch documents',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
      setSwitchingContainer(false);
    }
  };

  const fetchAllDocuments = async () => {
    try {
      setLoadingAllDocuments(true);
      
      // Check if we already have all documents in cache
      const cachedDocs = documentCache[selectedContainer];
      if (cachedDocs && cachedDocs.length > 50) { // Assume cache is reasonably complete if > 50 docs
        setDocuments(cachedDocs);
        setHasMore(false);
        setShowAllMode(true);
        
        toast({
          title: 'All documents loaded from cache',
          description: `${cachedDocs.length} documents`,
          status: 'success',
          duration: 2000,
          isClosable: true,
        });
        
        setLoadingAllDocuments(false);
        return;
      }
      
      // Use the optimized /all endpoint for better performance
      const endpoint = `/api/feedback/documents/all?container=${selectedContainer}`;
      const response = await fetch(endpoint);
      
      if (!response.ok) {
        throw new Error('Failed to fetch all documents');
      }

      const allDocs = await response.json();
      
      setDocuments(allDocs);
      setHasMore(false);
      setShowAllMode(true);
      
      // Update cache with all documents
      setDocumentCache(prev => ({
        ...prev,
        [selectedContainer]: allDocs
      }));
      
      toast({
        title: 'All documents loaded',
        description: `Loaded ${allDocs.length} documents`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load all documents',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setLoadingAllDocuments(false);
    }
  };

  // Preload documents for a container in the background
  const preloadDocuments = async (container: ContainerType) => {
    if (preloadingContainers.has(container) || documentCache[container]?.length > 0) {
      return; // Already preloading or already cached
    }
    
    setPreloadingContainers(prev => new Set([...prev, container]));
    
    try {
      const response = await fetch(`/api/feedback/documents/all?container=${container}`);
      if (!response.ok) {
        throw new Error('Failed to preload documents');
      }
      
      const allDocs = await response.json();
      
      setDocumentCache(prev => ({
        ...prev,
        [container]: allDocs
      }));
      
      console.log(`Preloaded ${allDocs.length} documents for ${container}`);
    } catch (error) {
      console.warn(`Failed to preload documents for ${container}:`, error);
    } finally {
      setPreloadingContainers(prev => {
        const newSet = new Set(prev);
        newSet.delete(container);
        return newSet;
      });
    }
  };

  useEffect(() => {
    loadContainers();
    
    // Preload NBA Official documents after initial load
    const preloadTimer = setTimeout(() => {
      preloadDocuments('nba-official');
    }, 1000); // Wait 1 second after component mount
    
    return () => clearTimeout(preloadTimer);
  }, []);

  // Persist query results to localStorage with size limit
  useEffect(() => {
    try {
      // Only store essential data to prevent localStorage bloat
      const compactResults = Object.fromEntries(
        Object.entries(queryResults).map(([key, result]) => [
          key,
          {
            ...result,
            // Limit stored data to prevent memory issues
            data: result.data ? result.data.slice(0, 100) : [],
            storedRowCount: result.data ? Math.min(result.data.length, 100) : 0
          }
        ])
      );
      
      const serialized = JSON.stringify(compactResults);
      // Check if the data is too large (> 5MB)
      if (serialized.length > 5 * 1024 * 1024) {
        console.warn('Query results too large for localStorage, clearing old results');
        localStorage.removeItem('feedbackDocuments_queryResults');
      } else {
        localStorage.setItem('feedbackDocuments_queryResults', serialized);
      }
    } catch (error) {
      console.warn('Failed to save query results to localStorage:', error);
      // Clear localStorage if it's full
      localStorage.removeItem('feedbackDocuments_queryResults');
    }
  }, [queryResults]);

  // Persist selected databases to localStorage
  useEffect(() => {
    localStorage.setItem('feedbackDocuments_selectedDatabases', JSON.stringify(selectedDatabases));
  }, [selectedDatabases]);

  // Persist document cache to localStorage with size limit
  useEffect(() => {
    try {
      // Keep cache size manageable - only store up to 3 containers with max 500 docs each
      const compactCache = Object.fromEntries(
        Object.entries(documentCache).slice(-3).map(([container, docs]) => [
          container,
          docs.slice(0, 500) // Limit to 500 docs per container
        ])
      );
      
      const serialized = JSON.stringify(compactCache);
      // Check if the data is too large (> 10MB)
      if (serialized.length > 10 * 1024 * 1024) {
        console.warn('Document cache too large, clearing old entries');
        localStorage.removeItem('feedbackDocuments_documentCache');
      } else {
        localStorage.setItem('feedbackDocuments_documentCache', serialized);
      }
    } catch (error) {
      console.warn('Failed to save document cache to localStorage:', error);
      localStorage.removeItem('feedbackDocuments_documentCache');
    }
  }, [documentCache]);

  useEffect(() => {
    setSwitchingContainer(true);
    // Clear query results when switching containers to free memory
    setQueryResults({});
    setShowingResults(new Set());
    setTablePage({}); // Reset table pagination
    setShowAllMode(false); // Reset show all mode
    
    // Clear localStorage cache for query results
    localStorage.removeItem('feedbackDocuments_queryResults');
    
    fetchDocuments(1);
    
    // Preload other containers in the background for faster switching
    const otherContainers: ContainerType[] = ['nba-official', 'nba-unofficial', 'mlb', 'mlb-unofficial'];
    const containersToPreload = otherContainers.filter(c => c !== selectedContainer);
    
    // Staggered preloading to avoid overwhelming the server
    containersToPreload.forEach((container, index) => {
      setTimeout(() => {
        preloadDocuments(container);
      }, (index + 1) * 2000); // 2 second intervals
    });
  }, [selectedContainer]);

  const handleCreate = async () => {
    try {
      const response = await fetch(`/api/feedback/documents?container=${selectedContainer}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          UserPrompt: '',
          Query: ''
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create document');
      }

      const newDoc = await response.json();
      setDocuments(prev => [newDoc, ...prev]);
      setEditingDoc(newDoc);
      
      // Invalidate document cache for this container
      setDocumentCache(prev => {
        const updated = { ...prev };
        delete updated[selectedContainer];
        return updated;
      });

      toast({
        title: 'Document created',
        status: 'success',
        duration: 2000,
        isClosable: true,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create document',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const handleSave = async () => {
    if (!editingDoc?.id) return;
    
    try {
      const response = await fetch(`/api/feedback/documents/${editingDoc.id}?container=${selectedContainer}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(editingDoc)
      });

      if (!response.ok) {
        throw new Error('Failed to save document');
      }

      const savedDoc = await response.json();
      setDocuments(docs => docs.map(doc => 
        doc.id === savedDoc.id ? savedDoc : doc
      ));
      setEditingDoc(null);
      
      // Invalidate document cache for this container
      setDocumentCache(prev => {
        const updated = { ...prev };
        delete updated[selectedContainer];
        return updated;
      });

      toast({
        title: 'Document saved',
        status: 'success',
        duration: 2000,
        isClosable: true,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save document',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const handleDelete = async (docId: string) => {
    if (!window.confirm('Are you sure you want to delete this document?')) {
      return;
    }

    try {
      const response = await fetch(`/api/feedback/documents/${docId}?container=${selectedContainer}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to delete document');
      }

      setDocuments(docs => docs.filter(doc => doc.id !== docId));
      if (editingDoc?.id === docId) {
        setEditingDoc(null);
      }
      
      // Invalidate document cache for this container
      setDocumentCache(prev => {
        const updated = { ...prev };
        delete updated[selectedContainer];
        return updated;
      });

      toast({
        title: 'Document deleted',
        status: 'success',
        duration: 2000,
        isClosable: true,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete document',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const handleTransfer = async (docId: string) => {
    // Determine the correct target container based on current container
    const getTargetContainer = (sourceContainer: string): string => {
      switch (sourceContainer) {
        case 'mlb-unofficial':
          return 'mlb';
        case 'nba-unofficial':
          return 'nba-official';
        default:
          return 'mlb'; // Fallback
      }
    };

    const targetContainer = getTargetContainer(selectedContainer);

    try {
      const response = await fetch(
        `/api/feedback/documents/${docId}/transfer?source_container=${selectedContainer}&target_container=${targetContainer}`,
        {
          method: 'POST'
        }
      );

      if (!response.ok) {
        throw new Error('Failed to transfer document');
      }

      setDocuments(docs => docs.filter(doc => doc.id !== docId));
      
      // Invalidate document cache for both source and target containers
      setDocumentCache(prev => {
        const updated = { ...prev };
        delete updated[selectedContainer]; // source container
        delete updated[targetContainer]; // target container
        return updated;
      });
      
      const targetLabel = targetContainer === 'mlb' ? 'MLB Official' : 'NBA Official';
      
      toast({
        title: 'Document transferred',
        description: `Document transferred to ${targetLabel}`,
        status: 'success',
        duration: 2000,
        isClosable: true,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to transfer document',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const debouncedSearch = useCallback(
    debounce((query: string) => {
      setSearchQuery(query);
      setShowAllMode(false); // Exit show all mode when searching
      fetchDocuments(1, query);
    }, 300),
    [selectedContainer]
  );

  // Function to generate preview of changes
  const handlePreviewChanges = async () => {
    if (!findText) return;

    try {
      const response = await fetch(
        `/api/feedback/documents/search?q=${encodeURIComponent(findText)}&container=${selectedContainer}&field=${bulkEditField}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch documents');
      }

      const matched = await response.json();
      setMatchedDocuments(matched);

      const previews: BulkEditPreview[] = matched.map((doc: FeedbackDocument) => ({
        id: doc.id!,
        field: bulkEditField,
        oldValue: doc[bulkEditField] || '',
        newValue: (doc[bulkEditField] || '').split(findText).join(replaceText),
        selected: true
      }));

      setPreviewChanges(previews);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to search documents',
        status: 'error',
        duration: 3000,
        isClosable: true
      });
    }
  };

  // Function to apply bulk changes
  const handleApplyBulkChanges = async () => {
    const selectedPreviews = previewChanges.filter(preview => preview.selected);
    if (selectedPreviews.length === 0) return;

    try {
      const updates = selectedPreviews.map(preview => {
        const doc = matchedDocuments.find(d => d.id === preview.id) || documents.find(d => d.id === preview.id);
        if (!doc) return null;
        return {
          ...doc,
          [preview.field]: preview.newValue
        };
      }).filter((doc): doc is FeedbackDocument => doc !== null);

      // Update each document
      await Promise.all(
        updates.map(doc =>
          fetch(`/api/feedback/documents/${doc.id}?container=${selectedContainer}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(doc)
          })
        )
      );

      // Update local state
      setDocuments(docs =>
        docs.map(doc => {
          const update = updates.find(u => u.id === doc.id);
          return update || doc;
        })
      );
      setMatchedDocuments(docs =>
        docs.map(doc => {
          const update = updates.find(u => u.id === doc.id);
          return update || doc;
        })
      );

      toast({
        title: 'Bulk update successful',
        description: `Updated ${selectedPreviews.length} documents`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });

      // Reset bulk edit state
      setPreviewChanges([]);
      setFindText('');
      setReplaceText('');
      onBulkEditClose();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to apply bulk updates',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  // Function to toggle selection of all previews
  const handleToggleSelectAll = (value: boolean) => {
    setSelectAll(value);
    setPreviewChanges(prev =>
      prev.map(preview => ({
        ...preview,
        selected: value
      }))
    );
  };

  // Function to toggle individual preview selection
  const handleTogglePreview = (id: string) => {
    setPreviewChanges(prev =>
      prev.map(preview =>
        preview.id === id
          ? { ...preview, selected: !preview.selected }
          : preview
      )
    );
  };

  const handleUpdatePreviewValue = (id: string, value: string) => {
    setPreviewChanges(prev =>
      prev.map(preview =>
        preview.id === id ? { ...preview, newValue: value } : preview
      )
    );
  };

  const scrollToCard = (docId: string) => {
    setTimeout(() => {
      const cardElement = document.querySelector(`[data-card-id="${docId}"]`);
      if (cardElement) {
        cardElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
      }
    }, 100);
  };

  // Helper function to get default database based on container
  const getDefaultDatabase = () => {
    return selectedContainer === 'nba-official' || selectedContainer === 'nba-unofficial' ? 'nba' : 'mlb';
  };

  const handleRunQuery = async (docId: string, query: string) => {
    if (!query.trim()) {
      toast({
        title: 'Error',
        description: 'No query to execute',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    const database = selectedDatabases[docId] || getDefaultDatabase();
    
    setQueryLoading(prev => new Set([...prev, docId]));
    
    try {
      const result = await executeQuery({
        database,
        query: query.trim()
      });
      
      console.log('Query result for docId:', docId, result);
      
      // Limit result size to prevent memory issues and white screen
      const processedResult = {
        ...result,
        data: result.data ? result.data.slice(0, 1000) : [], // Limit to 1000 rows max
        originalRowCount: result.row_count, // Keep track of original count
        truncated: result.data && result.data.length > 1000
      };
      
      // Clean up large results from memory before storing new ones
      setQueryResults(prev => {
        // Remove old results to free memory
        const cleanedResults = Object.fromEntries(
          Object.entries(prev).slice(-5) // Keep only last 5 results
        );
        
        const newResults = {
          ...cleanedResults,
          [docId]: processedResult
        };
        console.log('Updated queryResults:', newResults);
        return newResults;
      });
      
      setShowingResults(prev => new Set([...prev, docId]));
      
      if (result.success) {
        const displayCount = processedResult.truncated ? '1000+' : result.row_count;
        toast({
          title: 'Query executed successfully',
          description: `${displayCount} rows returned from ${database.toUpperCase()} database${processedResult.truncated ? ' (showing first 1000)' : ''}`,
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
      } else {
        toast({
          title: 'Query failed',
          description: result.error || 'Unknown error occurred',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      }
      
      // Scroll to card after query execution
      scrollToCard(docId);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to execute query',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setQueryLoading(prev => {
        const newSet = new Set(prev);
        newSet.delete(docId);
        return newSet;
      });
    }
  };

  const handleToggleView = (docId: string) => {
    console.log('Toggle view for docId:', docId);
    console.log('Current queryResults:', queryResults);
    console.log('Has cached result for doc:', !!queryResults[docId]);
    console.log('Currently showing results:', showingResults.has(docId));
    
    setShowingResults(prev => {
      const newSet = new Set(prev);
      if (newSet.has(docId)) {
        console.log('Removing from results view');
        newSet.delete(docId);
      } else {
        // Only add to results view if we have cached results
        if (queryResults[docId]) {
          console.log('Adding to results view');
          newSet.add(docId);
        } else {
          console.log('No cached results found');
        }
      }
      return newSet;
    });
    
    // Scroll to card after view toggle
    scrollToCard(docId);
  };

  const handleRerunQuery = async (docId: string, query: string) => {
    // Clear existing results and re-run query
    setQueryResults(prev => {
      const newResults = { ...prev };
      delete newResults[docId];
      return newResults;
    });
    
    await handleRunQuery(docId, query);
  };

  const handleDatabaseChange = (docId: string, database: string) => {
    setSelectedDatabases(prev => ({
      ...prev,
      [docId]: database
    }));
  };

  return (
    <Container maxW="container.xl" py={8}>
      <Stack spacing={6}>
        <Flex justify="space-between" align="center">
          <Box>
            <Heading size="lg">Feedback Documents</Heading>
            <Text color="gray.600" mt={2}>
              {containers.find(c => c.value === selectedContainer)?.label || 'Manage and browse feedback documents'}
            </Text>
          </Box>
          <ButtonGroup>
            <Button
              leftIcon={<RepeatIcon />}
              onClick={onBulkEditOpen}
              colorScheme="purple"
            >
              Bulk Edit
            </Button>
            {!showAllMode && !searchQuery && (
              <Button
                colorScheme="orange"
                onClick={fetchAllDocuments}
                isLoading={loadingAllDocuments}
                loadingText="Loading All..."
                isDisabled={loading || switchingContainer}
              >
                Show All Documents
              </Button>
            )}
            {showAllMode && (
              <Button
                colorScheme="gray"
                onClick={() => {
                  setShowAllMode(false);
                  fetchDocuments(1);
                }}
                isDisabled={loading || switchingContainer}
              >
                Back to Pagination
              </Button>
            )}
            <Button colorScheme="blue" onClick={handleCreate}>
              New Document
            </Button>
          </ButtonGroup>
        </Flex>

        <Flex gap={4} align="center">
          <Select
            value={selectedContainer}
            onChange={(e) => setSelectedContainer(e.target.value as ContainerType)}
            maxW="400px"
            isDisabled={loading}
          >
            {containers.map(container => (
              <option key={container.value} value={container.value}>
                {container.label}
              </option>
            ))}
          </Select>

          <InputGroup maxW="400px">
            <InputLeftElement pointerEvents="none">
              <SearchIcon color="gray.300" />
            </InputLeftElement>
            <Input
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                debouncedSearch(e.target.value);
              }}
              isDisabled={loading}
            />
          </InputGroup>
        </Flex>

        <Stack spacing={6} position="relative">
          {(loading || switchingContainer) && (
            <Flex
              position="absolute"
              inset={0}
              bg="whiteAlpha.800"
              zIndex={1}
              justify="center"
              align="center"
              backdropFilter="blur(2px)"
              transition="all 0.2s"
            >
              <Stack align="center" spacing={3}>
                <Spinner size="xl" color="blue.500" />
                <Text color="gray.600">
                  {switchingContainer ? 'Switching container...' : 'Loading documents...'}
                </Text>
              </Stack>
            </Flex>
          )}

          <Stack 
            spacing={6} 
            opacity={switchingContainer ? 0.5 : 1}
            transition="all 0.2s"
          >
            {documents.map(doc => (
              <Card 
                key={doc.id}
                data-card-id={doc.id}
                transition="all 0.2s"
                transform={switchingContainer ? 'scale(0.98)' : 'scale(1)'}
              >
                <CardBody>
                  {editingDoc?.id === doc.id ? (
                    <Stack spacing={4}>
                      <Box>
                        <Text mb={2} fontWeight="medium">User Prompt</Text>
                        <Textarea
                          value={editingDoc?.UserPrompt ?? ''}
                          onChange={(e) => setEditingDoc(prev => {
                            if (!prev) return null;
                            return {
                              ...prev,
                              UserPrompt: e.target.value
                            };
                          })}
                        />
                      </Box>
                      
                      <Box>
                        <Text mb={2} fontWeight="medium">Query</Text>
                        <Textarea
                          value={editingDoc?.Query ?? ''}
                          onChange={(e) => setEditingDoc(prev => {
                            if (!prev) return null;
                            return {
                              ...prev,
                              Query: e.target.value
                            };
                          })}
                          fontFamily="mono"
                          minH="200px"
                        />
                      </Box>
                      

                      
                      <Flex justify="flex-end" gap={2}>
                        <Button onClick={() => setEditingDoc(null)}>Cancel</Button>
                        <Button colorScheme="blue" onClick={handleSave}>Save</Button>
                      </Flex>
                    </Stack>
                  ) : showingResults.has(doc.id!) && queryResults[doc.id!] ? (
                    // Results View
                    <Stack spacing={4}>
                                              <Flex justify="space-between" align="center">
                          <Heading size="md">Query Results</Heading>
                          <ButtonGroup size="sm">
                            <Button
                              leftIcon={<RepeatIcon />}
                              colorScheme="blue"
                              onClick={() => handleRerunQuery(doc.id!, doc.Query || '')}
                              isLoading={queryLoading.has(doc.id!)}
                              loadingText="Running..."
                              isDisabled={!doc.Query || !doc.Query.trim()}
                            >
                              Re-run Query
                            </Button>
                            <Button
                              leftIcon={<ArrowBackIcon />}
                              onClick={() => handleToggleView(doc.id!)}
                            >
                              Back to Query
                            </Button>
                          </ButtonGroup>
                        </Flex>

                      <Box>
                        <Text fontWeight="medium" mb={2}>
                          Database: {(selectedDatabases[doc.id!] || getDefaultDatabase()).toUpperCase()}
                        </Text>
                        <Text fontSize="sm" color="gray.600">
                          Rows returned: {queryResults[doc.id!]!.originalRowCount || queryResults[doc.id!]!.row_count || 0}
                          {queryResults[doc.id!]!.truncated && (
                            <Text as="span" color="orange.600" ml={2}>
                              (truncated to 1000 rows for performance)
                            </Text>
                          )}
                        </Text>
                      </Box>

                      {queryResults[doc.id!]!.success ? (
                        (queryResults[doc.id!]!.data && queryResults[doc.id!]!.data!.length > 0) ? (
                          <Box>
                            <Box overflowX="auto" maxH="600px" overflowY="auto">
                              <Table variant="simple" size="sm">
                                <Thead position="sticky" top={0} bg="white" zIndex={1}>
                                  <Tr>
                                    {Object.keys(queryResults[doc.id!]!.data![0]).map(column => (
                                      <Th key={column}>{column}</Th>
                                    ))}
                                  </Tr>
                                </Thead>
                                <Tbody>
                                  {(() => {
                                    const currentPage = tablePage[doc.id!] || 1;
                                    const startIndex = (currentPage - 1) * tablePageSize;
                                    const endIndex = startIndex + tablePageSize;
                                    const pageData = queryResults[doc.id!]!.data!.slice(startIndex, endIndex);
                                    
                                    return pageData.map((row, index) => (
                                      <Tr key={startIndex + index}>
                                        {Object.values(row).map((value, cellIndex) => (
                                          <Td key={cellIndex} maxW="300px" isTruncated>
                                            {value !== null && value !== undefined ? String(value) : ''}
                                          </Td>
                                        ))}
                                      </Tr>
                                    ));
                                  })()}
                                </Tbody>
                              </Table>
                            </Box>
                            
                            {/* Pagination Controls */}
                            {queryResults[doc.id!]!.data!.length > tablePageSize && (
                              <Flex justify="space-between" align="center" mt={4} p={2} bg="gray.50" borderRadius="md">
                                <Text fontSize="sm" color="gray.600">
                                  Showing {((tablePage[doc.id!] || 1) - 1) * tablePageSize + 1} to{' '}
                                  {Math.min((tablePage[doc.id!] || 1) * tablePageSize, queryResults[doc.id!]!.data!.length)} of{' '}
                                  {queryResults[doc.id!]!.data!.length} rows
                                  {queryResults[doc.id!]!.truncated && (
                                    <Text as="span" color="orange.600" ml={2}>
                                      (truncated from {queryResults[doc.id!]!.originalRowCount})
                                    </Text>
                                  )}
                                </Text>
                                <ButtonGroup size="sm">
                                  <Button
                                    onClick={() => setTablePage(prev => ({
                                      ...prev,
                                      [doc.id!]: Math.max(1, (prev[doc.id!] || 1) - 1)
                                    }))}
                                    isDisabled={(tablePage[doc.id!] || 1) <= 1}
                                  >
                                    Previous
                                  </Button>
                                  <Text fontSize="sm" px={3} py={2}>
                                    Page {tablePage[doc.id!] || 1} of{' '}
                                    {Math.ceil(queryResults[doc.id!]!.data!.length / tablePageSize)}
                                  </Text>
                                  <Button
                                    onClick={() => setTablePage(prev => ({
                                      ...prev,
                                      [doc.id!]: Math.min(
                                        Math.ceil(queryResults[doc.id!]!.data!.length / tablePageSize),
                                        (prev[doc.id!] || 1) + 1
                                      )
                                    }))}
                                    isDisabled={
                                      (tablePage[doc.id!] || 1) >= 
                                      Math.ceil(queryResults[doc.id!]!.data!.length / tablePageSize)
                                    }
                                  >
                                    Next
                                  </Button>
                                </ButtonGroup>
                              </Flex>
                            )}
                          </Box>
                        ) : (
                          <Box p={4} bg="gray.50" borderRadius="md">
                            <Text>Query executed successfully but returned no results.</Text>
                          </Box>
                        )
                      ) : (
                        <Box p={4} bg="red.50" borderRadius="md" borderLeft="4px solid" borderColor="red.400">
                          <Text fontWeight="medium" color="red.600">Query Error</Text>
                          <Text color="red.600" fontSize="sm">
                            {queryResults[doc.id!]!.error || 'Unknown error occurred'}
                          </Text>
                        </Box>
                      )}

                      {doc._ts && (
                        <Text fontSize="sm" color="gray.500">
                          Last updated: {new Date(doc._ts * 1000).toLocaleString()}
                        </Text>
                      )}
                    </Stack>
                  ) : (
                    // Query View
                    <Stack spacing={4}>
                      <Box>
                        <Text fontWeight="medium">User Prompt</Text>
                        <Text>{doc.UserPrompt || '(empty)'}</Text>
                      </Box>
                      
                      <Box>
                        <Text fontWeight="medium">Query</Text>
                        <Box
                          bg="gray.50"
                          p={4}
                          borderRadius="md"
                          fontFamily="mono"
                          whiteSpace="pre-wrap"
                        >
                          {doc.Query || '(empty)'}
                        </Box>
                      </Box>
                      


                      {doc._ts && (
                        <Text fontSize="sm" color="gray.500">
                          Last updated: {new Date(doc._ts * 1000).toLocaleString()}
                        </Text>
                      )}
                      
                      <Flex justify="space-between" align="center" gap={4}>
                        {/* Database Selector and Run Button */}
                        <Flex gap={2} align="center">
                          <Text fontSize="sm" fontWeight="medium">Database:</Text>
                          <Select
                            size="sm"
                            value={selectedDatabases[doc.id!] || getDefaultDatabase()}
                            onChange={(e) => handleDatabaseChange(doc.id!, e.target.value)}
                            width="140px"
                          >
                            <option value="mlb">MLB Database</option>
                            <option value="nba">NBA Database</option>
                          </Select>
                          <Button
                            leftIcon={<ChevronRightIcon />}
                            colorScheme="green"
                            size="sm"
                            onClick={() => {
                              if (queryResults[doc.id!] && !showingResults.has(doc.id!)) {
                                handleToggleView(doc.id!);
                              } else {
                                handleRunQuery(doc.id!, doc.Query || '');
                              }
                            }}
                            isLoading={queryLoading.has(doc.id!)}
                            loadingText="Running..."
                            isDisabled={!doc.Query || !doc.Query.trim()}
                          >
                            {(() => {
                              const hasResults = !!queryResults[doc.id!];
                              const isShowingResults = showingResults.has(doc.id!);
                              const buttonText = hasResults && !isShowingResults ? 'View Results' : 'Run Query';
                              console.log(`Button for ${doc.id}: hasResults=${hasResults}, isShowingResults=${isShowingResults}, buttonText=${buttonText}`);
                              return buttonText;
                            })()}
                          </Button>
                        </Flex>

                        <ButtonGroup size="sm">
                          {(selectedContainer === 'mlb-unofficial' || selectedContainer === 'nba-unofficial') && (
                            <Button
                              leftIcon={<ArrowUpIcon />}
                              colorScheme="green"
                              onClick={() => handleTransfer(doc.id!)}
                              title="Transfer to Official Feedback"
                              size="sm"
                            >
                              Transfer to Official
                            </Button>
                          )}
                          <IconButton
                            aria-label="Edit"
                            icon={<EditIcon />}
                            onClick={() => {
                              setEditingDoc(doc);
                              scrollToCard(doc.id!);
                            }}
                          />
                          <IconButton
                            aria-label="Delete"
                            icon={<DeleteIcon />}
                            colorScheme="red"
                            onClick={() => handleDelete(doc.id!)}
                          />
                        </ButtonGroup>
                      </Flex>
                    </Stack>
                  )}
                </CardBody>
              </Card>
            ))}

            {!searchQuery && hasMore && !showAllMode && (
              <Button
                onClick={() => fetchDocuments(page + 1, searchQuery)}
                isLoading={loading}
                alignSelf="center"
                isDisabled={switchingContainer}
              >
                {loading ? 'Loading...' : 'Load More'}
              </Button>
            )}

            {showAllMode && documents.length > 0 && (
              <Box textAlign="center" p={4} bg="green.50" borderRadius="md">
                <Text color="green.700" fontWeight="medium">
                  Showing all {documents.length} documents
                </Text>
                <Text fontSize="sm" color="green.600">
                  All documents are loaded. Use search to filter or switch back to pagination.
                </Text>
              </Box>
            )}

            {documents.length === 0 && !loading && !switchingContainer && (
              <Text textAlign="center" color="gray.500">
                No documents found
              </Text>
            )}
          </Stack>
        </Stack>

        {/* Bulk Edit Modal */}
        <Modal isOpen={isBulkEditOpen} onClose={onBulkEditClose} size="6xl">
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>Bulk Edit Documents</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <Stack spacing={6}>
                <FormControl>
                  <FormLabel>Select Field to Edit</FormLabel>
                  <RadioGroup value={bulkEditField} onChange={(value: BulkEditField) => setBulkEditField(value)}>
                    <Stack direction="row" spacing={4}>
                      <Radio value="Query">Query</Radio>
                      <Radio value="UserPrompt">User Prompt</Radio>
                    </Stack>
                  </RadioGroup>
                </FormControl>

                <Stack direction="row" spacing={4}>
                  <FormControl>
                    <FormLabel>Find</FormLabel>
                    <Input
                      value={findText}
                      onChange={(e) => setFindText(e.target.value)}
                      placeholder="Text to find..."
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>Replace</FormLabel>
                    <Input
                      value={replaceText}
                      onChange={(e) => setReplaceText(e.target.value)}
                      placeholder="Replace with..."
                    />
                  </FormControl>
                </Stack>

                <Button
                  onClick={handlePreviewChanges}
                  isDisabled={!findText}
                  colorScheme="blue"
                >
                  Preview Changes
                </Button>

                {previewChanges.length > 0 && (
                  <Stack spacing={4}>
                    <Flex justify="space-between" align="center">
                      <Text fontWeight="bold">
                        Found {previewChanges.length} documents with matches
                      </Text>
                      <Checkbox
                        isChecked={selectAll}
                        onChange={(e) => handleToggleSelectAll(e.target.checked)}
                      >
                        Select All
                      </Checkbox>
                    </Flex>

                    <Table variant="simple">
                      <Thead>
                        <Tr>
                          <Th width="50px"></Th>
                          <Th>Document Preview</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {previewChanges.map(preview => (
                          <Tr key={preview.id}>
                            <Td>
                              <Checkbox
                                isChecked={preview.selected}
                                onChange={() => handleTogglePreview(preview.id)}
                              />
                            </Td>
                            <Td>
                              <Accordion allowToggle>
                                <AccordionItem>
                                  <AccordionButton>
                                    <Box flex="1" textAlign="left">
                                      <Text fontWeight="medium" mb={1}>
                                        Changes in {preview.field}
                                      </Text>
                                      <Text fontSize="sm" color="gray.500">
                                        Click to view details
                                      </Text>
                                    </Box>
                                    <AccordionIcon />
                                  </AccordionButton>
                                  <AccordionPanel>
                                    <Stack spacing={4}>
                                      <Box>
                                        <Text fontWeight="medium" mb={2}>Original:</Text>
                                        <Box
                                          p={3}
                                          bg="gray.50"
                                          borderRadius="md"
                                          fontFamily="mono"
                                        >
                                          <Highlight
                                            query={findText}
                                            styles={{ bg: 'yellow.200' }}
                                          >
                                            {preview.oldValue}
                                          </Highlight>
                                        </Box>
                                      </Box>
                                      <Box>
                                        <Text fontWeight="medium" mb={2}>New:</Text>
                                        <Textarea
                                          value={preview.newValue}
                                          onChange={(e) =>
                                            handleUpdatePreviewValue(preview.id, e.target.value)
                                          }
                                          fontFamily="mono"
                                        />
                                      </Box>
                                    </Stack>
                                  </AccordionPanel>
                                </AccordionItem>
                              </Accordion>
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </Stack>
                )}
              </Stack>
            </ModalBody>

            <ModalFooter>
              <ButtonGroup>
                <Button variant="ghost" onClick={onBulkEditClose}>Cancel</Button>
                <Button
                  colorScheme="blue"
                  onClick={handleApplyBulkChanges}
                  isDisabled={!previewChanges.some(p => p.selected)}
                >
                  Apply Changes ({previewChanges.filter(p => p.selected).length})
                </Button>
              </ButtonGroup>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </Stack>
    </Container>
  );
}

export default FeedbackDocuments; 