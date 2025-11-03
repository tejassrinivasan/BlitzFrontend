import { useState, useEffect } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  useToast,
  Container,
  Heading,
  Card,
  CardBody,
  Spinner,
  Alert,
  AlertIcon,
  Badge,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Checkbox,
  CheckboxGroup,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Textarea,
} from '@chakra-ui/react';
import { CopyIcon, DownloadIcon } from '@chakra-ui/icons';
import { containers } from '../services/api';
import type { ContainerType, FeedbackDocument } from '../types/api';

interface UserPrompt {
  id: string;
  UserPrompt: string;
  container: ContainerType;
  Query?: string;
  AssistantPrompt?: string;
}

function UserPrompts() {
  const [userPrompts, setUserPrompts] = useState<UserPrompt[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedContainers, setSelectedContainers] = useState<ContainerType[]>(['mlb']);
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copyText, setCopyText] = useState('');
  const toast = useToast();

  // Fetch all user prompts from selected containers
  const fetchAllUserPrompts = async () => {
    if (selectedContainers.length === 0) {
      setUserPrompts([]);
      return;
    }

    setLoading(true);
    try {
      const allPrompts: UserPrompt[] = [];
      
      for (const container of selectedContainers) {
        try {
          const response = await fetch(`/api/feedback/documents/all?container=${encodeURIComponent(container)}`);
          if (response.ok) {
            const data = await response.json();
            const containerPrompts: UserPrompt[] = data.map((doc: FeedbackDocument) => ({
              id: doc.id || '',
              UserPrompt: doc.UserPrompt,
              container,
              Query: doc.Query,
              AssistantPrompt: doc.AssistantPrompt,
            }));
            allPrompts.push(...containerPrompts);
          }
        } catch (error) {
          console.error(`Error fetching from container ${container}:`, error);
        }
      }
      
      setUserPrompts(allPrompts);
    } catch (error) {
      console.error('Error fetching user prompts:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch user prompts',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllUserPrompts();
  }, [selectedContainers]);

  const handleContainerChange = (containers: string[]) => {
    setSelectedContainers(containers as ContainerType[]);
  };

  const copyAllPrompts = () => {
    const promptsText = userPrompts
      .map((prompt, index) => `${index + 1}. ${prompt.UserPrompt}`)
      .join('\n\n');
    
    setCopyText(promptsText);
    setCopyModalOpen(true);
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(copyText);
      toast({
        title: 'Success',
        description: 'All user prompts copied to clipboard!',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      setCopyModalOpen(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to copy to clipboard',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const downloadAsText = () => {
    const promptsText = userPrompts
      .map((prompt, index) => `${index + 1}. ${prompt.UserPrompt}`)
      .join('\n\n');
    
    const blob = new Blob([promptsText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'user-prompts.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: 'Success',
      description: 'User prompts downloaded as text file!',
      status: 'success',
      duration: 3000,
      isClosable: true,
    });
  };

  return (
    <Container maxW="container.xl" py={8}>
      <VStack spacing={6} align="stretch">
        <Box>
          <Heading size="lg" mb={2}>All User Prompts</Heading>
          <Text color="gray.600">
            View and copy all user prompts from selected containers
          </Text>
        </Box>

        {/* Container Selection */}
        <Card>
          <CardBody>
            <VStack spacing={4} align="stretch">
              <Text fontWeight="semibold">Select Containers:</Text>
              <CheckboxGroup value={selectedContainers} onChange={handleContainerChange}>
                <HStack spacing={4} wrap="wrap">
                  {containers.map((container) => (
                    <Checkbox key={container.id} value={container.id}>
                      <HStack>
                        <Text>{container.name}</Text>
                        <Badge size="sm" colorScheme="blue">
                          {userPrompts.filter(p => p.container === container.id).length}
                        </Badge>
                      </HStack>
                    </Checkbox>
                  ))}
                </HStack>
              </CheckboxGroup>
            </VStack>
          </CardBody>
        </Card>

        {/* Action Buttons */}
        <HStack spacing={4}>
          <Button
            leftIcon={<CopyIcon />}
            colorScheme="blue"
            onClick={copyAllPrompts}
            isDisabled={userPrompts.length === 0}
          >
            Copy All Prompts ({userPrompts.length})
          </Button>
          <Button
            leftIcon={<DownloadIcon />}
            colorScheme="green"
            onClick={downloadAsText}
            isDisabled={userPrompts.length === 0}
          >
            Download as Text
          </Button>
        </HStack>

        {/* User Prompts List */}
        <Card>
          <CardBody>
            {loading ? (
              <Box textAlign="center" py={8}>
                <Spinner size="xl" />
                <Text mt={4}>Loading user prompts...</Text>
              </Box>
            ) : userPrompts.length === 0 ? (
              <Alert status="info">
                <AlertIcon />
                No user prompts found in selected containers.
              </Alert>
            ) : (
              <VStack spacing={4} align="stretch">
                <HStack justify="space-between">
                  <Text fontWeight="semibold">
                    Total Prompts: {userPrompts.length}
                  </Text>
                </HStack>
                
                <TableContainer maxHeight="600px" overflowY="auto">
                  <Table size="sm" variant="striped">
                    <Thead bg="gray.100" position="sticky" top={0} zIndex={1}>
                      <Tr>
                        <Th>#</Th>
                        <Th>User Prompt</Th>
                        <Th>Container</Th>
                        <Th>Actions</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {userPrompts.map((prompt, index) => (
                        <Tr key={prompt.id}>
                          <Td fontWeight="bold">{index + 1}</Td>
                          <Td maxW="500px">
                            <Text noOfLines={3}>
                              {prompt.UserPrompt}
                            </Text>
                          </Td>
                          <Td>
                            <Badge colorScheme="blue">
                              {containers.find(c => c.id === prompt.container)?.name || prompt.container}
                            </Badge>
                          </Td>
                          <Td>
                            <Button
                              size="sm"
                              leftIcon={<CopyIcon />}
                              onClick={() => {
                                navigator.clipboard.writeText(prompt.UserPrompt);
                                toast({
                                  title: 'Copied!',
                                  description: 'Prompt copied to clipboard',
                                  status: 'success',
                                  duration: 2000,
                                  isClosable: true,
                                });
                              }}
                            >
                              Copy
                            </Button>
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </TableContainer>
              </VStack>
            )}
          </CardBody>
        </Card>
      </VStack>

      {/* Copy Modal */}
      <Modal isOpen={copyModalOpen} onClose={() => setCopyModalOpen(false)} size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Copy All User Prompts</ModalHeader>
          <ModalBody>
            <Text mb={4}>
              Preview of all {userPrompts.length} user prompts that will be copied:
            </Text>
            <Textarea
              value={copyText}
              onChange={(e) => setCopyText(e.target.value)}
              height="300px"
              fontFamily="mono"
              fontSize="sm"
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={() => setCopyModalOpen(false)}>
              Cancel
            </Button>
            <Button colorScheme="blue" onClick={copyToClipboard}>
              Copy to Clipboard
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Container>
  );
}

export default UserPrompts; 