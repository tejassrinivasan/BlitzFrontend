import React, { useState, useEffect, useCallback } from 'react';
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
  Badge,
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
  const [selectedContainer, setSelectedContainer] = useState<ContainerType>('mlb');
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
      } else {
        setDocuments(prev => [...prev, ...data]);
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

  useEffect(() => {
    loadContainers();
  }, []);

  // Persist query results to localStorage
  useEffect(() => {
    localStorage.setItem('feedbackDocuments_queryResults', JSON.stringify(queryResults));
  }, [queryResults]);

  // Persist selected databases to localStorage
  useEffect(() => {
    localStorage.setItem('feedbackDocuments_selectedDatabases', JSON.stringify(selectedDatabases));
  }, [selectedDatabases]);

  useEffect(() => {
    setSwitchingContainer(true);
    // Clear query results when switching containers
    setQueryResults({});
    setShowingResults(new Set());
    fetchDocuments(1);
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
      
      setQueryResults(prev => {
        const newResults = {
          ...prev,
          [docId]: result
        };
        console.log('Updated queryResults:', newResults);
        return newResults;
      });
      
      setShowingResults(prev => new Set([...prev, docId]));
      
      if (result.success) {
        toast({
          title: 'Query executed successfully',
          description: `${result.row_count} rows returned from ${database.toUpperCase()} database`,
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
                          Rows returned: {queryResults[doc.id!]!.row_count || 0}
                        </Text>
                      </Box>

                      {queryResults[doc.id!]!.success ? (
                        (queryResults[doc.id!]!.data && queryResults[doc.id!]!.data.length > 0) ? (
                          <Box overflowX="auto">
                            <Table variant="simple" size="sm">
                              <Thead>
                                <Tr>
                                  {Object.keys(queryResults[doc.id!]!.data[0]).map(column => (
                                    <Th key={column}>{column}</Th>
                                  ))}
                                </Tr>
                              </Thead>
                              <Tbody>
                                {queryResults[doc.id!]!.data.slice(0, 100).map((row, index) => (
                                  <Tr key={index}>
                                    {Object.values(row).map((value, cellIndex) => (
                                      <Td key={cellIndex}>
                                        {value !== null && value !== undefined ? String(value) : ''}
                                      </Td>
                                    ))}
                                  </Tr>
                                ))}
                              </Tbody>
                            </Table>
                            {queryResults[doc.id!]!.data.length > 100 && (
                              <Text fontSize="sm" color="gray.600" mt={2}>
                                Showing first 100 rows of {queryResults[doc.id!]!.data.length}
                              </Text>
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

            {!searchQuery && hasMore && (
              <Button
                onClick={() => fetchDocuments(page + 1, searchQuery)}
                isLoading={loading}
                alignSelf="center"
                isDisabled={switchingContainer}
              >
                {loading ? 'Loading...' : 'Load More'}
              </Button>
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