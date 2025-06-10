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
import { SearchIcon, EditIcon, DeleteIcon, ArrowUpIcon, RepeatIcon } from '@chakra-ui/icons';
import debounce from 'lodash/debounce';
import { FeedbackDocument } from '../server/services/cosmosService';

type ContainerType = 
  | 'mlb'
  | 'mlb-partner-feedback-helpful'
  | 'mlb-partner-feedback-unhelpful'
  | 'mlb-user-feedback'
  | 'mlb-user-feedback-unhelpful';

const containers = [
  { id: 'mlb', name: 'Official Documents', description: 'Official MLB feedback documents' },
  { id: 'mlb-partner-feedback-helpful', name: 'Helpful Partner Feedback', description: 'Helpful feedback from partners' },
  { id: 'mlb-partner-feedback-unhelpful', name: 'Unhelpful Partner Feedback', description: 'Unhelpful feedback from partners' },
  { id: 'mlb-user-feedback', name: 'Helpful User Feedback', description: 'Helpful feedback from users' },
  { id: 'mlb-user-feedback-unhelpful', name: 'Unhelpful User Feedback', description: 'Unhelpful feedback from users' },
];

type BulkEditField = 'UserPrompt' | 'Query' | 'AssistantPrompt';

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
  const toast = useToast();
  const [switchingContainer, setSwitchingContainer] = useState(false);
  const { isOpen: isBulkEditOpen, onOpen: onBulkEditOpen, onClose: onBulkEditClose } = useDisclosure();
  const [bulkEditField, setBulkEditField] = useState<BulkEditField>('Query');
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [previewChanges, setPreviewChanges] = useState<BulkEditPreview[]>([]);
  const [selectAll, setSelectAll] = useState(true);

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
    setSwitchingContainer(true);
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
          Query: '',
          AssistantPrompt: ''
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
    try {
      const response = await fetch(
        `/api/feedback/documents/${docId}/transfer?source_container=${selectedContainer}&target_container=mlb`,
        {
          method: 'POST'
        }
      );

      if (!response.ok) {
        throw new Error('Failed to transfer document');
      }

      setDocuments(docs => docs.filter(doc => doc.id !== docId));
      
      toast({
        title: 'Document transferred',
        description: 'Document transferred to official feedback',
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
  const handlePreviewChanges = () => {
    if (!findText) return;

    const previews: BulkEditPreview[] = documents
      .filter(doc => doc[bulkEditField]?.includes(findText))
      .map(doc => ({
        id: doc.id!,
        field: bulkEditField,
        oldValue: doc[bulkEditField] || '',
        newValue: (doc[bulkEditField] || '').split(findText).join(replaceText),
        selected: true
      }));

    setPreviewChanges(previews);
  };

  // Function to apply bulk changes
  const handleApplyBulkChanges = async () => {
    const selectedPreviews = previewChanges.filter(preview => preview.selected);
    if (selectedPreviews.length === 0) return;

    try {
      const updates = selectedPreviews.map(preview => {
        const doc = documents.find(d => d.id === preview.id);
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

  return (
    <Container maxW="container.xl" py={8}>
      <Stack spacing={6}>
        <Flex justify="space-between" align="center">
          <Box>
            <Heading size="lg">Feedback Documents</Heading>
            <Text color="gray.600" mt={2}>
              {containers.find(c => c.id === selectedContainer)?.description}
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
              <option key={container.id} value={container.id}>
                {container.name}
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
                      
                      <Box>
                        <Text mb={2} fontWeight="medium">Assistant Prompt</Text>
                        <Textarea
                          value={editingDoc?.AssistantPrompt ?? ''}
                          onChange={(e) => setEditingDoc(prev => {
                            if (!prev) return null;
                            return {
                              ...prev,
                              AssistantPrompt: e.target.value
                            };
                          })}
                        />
                      </Box>
                      
                      <Flex justify="flex-end" gap={2}>
                        <Button onClick={() => setEditingDoc(null)}>Cancel</Button>
                        <Button colorScheme="blue" onClick={handleSave}>Save</Button>
                      </Flex>
                    </Stack>
                  ) : (
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
                      
                      <Box>
                        <Text fontWeight="medium">Assistant Prompt</Text>
                        <Text>{doc.AssistantPrompt || '(empty)'}</Text>
                      </Box>

                      {doc._ts && (
                        <Text fontSize="sm" color="gray.500">
                          Last updated: {new Date(doc._ts * 1000).toLocaleString()}
                        </Text>
                      )}
                      
                      <Flex justify="flex-end" gap={2}>
                        <ButtonGroup size="sm">
                          {selectedContainer !== 'mlb' && (
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
                            onClick={() => setEditingDoc(doc)}
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
                      <Radio value="AssistantPrompt">Assistant Prompt</Radio>
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