import { useState } from 'react';
import {
  ChakraProvider,
  Box,
  VStack,
  Input,
  Button,
  Text,
  Textarea,
  useToast,
  Container,
  Heading,
  Card,
  CardBody,
  Divider,
  Flex,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
} from '@chakra-ui/react';
import { generateInsights, startConversation } from './services/api';
import type { ApiResponse } from './types/api';
import FeedbackDocuments from './pages/FeedbackDocuments';

function QueryInterface() {
  const [question, setQuestion] = useState('');
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const handleGenerateInsights = async () => {
    if (!question.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a question',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    setLoading(true);
    try {
      const result = await generateInsights({ question });
      setResponse(result);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to generate insights',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStartConversation = async () => {
    if (!question.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a question',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    setLoading(true);
    try {
      const result = await startConversation({ question });
      setResponse(result);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to start conversation',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box p={8}>
      <VStack spacing={6} align="stretch">
        <Heading as="h1" size="xl" textAlign="center">
          BlitzLLM Query Interface
        </Heading>
        
        <Card>
          <CardBody>
            <VStack spacing={4}>
              <Textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Enter your question here..."
                size="lg"
              />
              <Box display="flex" gap={4}>
                <Button
                  colorScheme="blue"
                  onClick={handleGenerateInsights}
                  isLoading={loading}
                >
                  Generate Insights
                </Button>
                <Button
                  colorScheme="green"
                  onClick={handleStartConversation}
                  isLoading={loading}
                >
                  Start Conversation
                </Button>
              </Box>
            </VStack>
          </CardBody>
        </Card>

        {response && (
          <Card>
            <CardBody>
              <VStack align="stretch" spacing={4}>
                {response.clarification_needed ? (
                  <>
                    <Text fontWeight="bold">Clarification Needed:</Text>
                    <Text>{response.clarifying_question}</Text>
                  </>
                ) : (
                  <>
                    <Text fontWeight="bold">Answer:</Text>
                    <Text>{response.answer}</Text>
                    {response.sql_query && (
                      <>
                        <Divider />
                        <Text fontWeight="bold">Generated SQL Query:</Text>
                        <Box
                          bg="gray.50"
                          p={4}
                          borderRadius="md"
                          fontFamily="mono"
                        >
                          {response.sql_query}
                        </Box>
                      </>
                    )}
                  </>
                )}
              </VStack>
            </CardBody>
          </Card>
        )}
      </VStack>
    </Box>
  );
}

function App() {
  return (
    <ChakraProvider>
      <Box minH="100vh" bg="gray.50">
        <Tabs isLazy>
          <TabList bg="white" borderBottomWidth="1px" px={8}>
            <Tab>Query Interface</Tab>
            <Tab>Feedback Documents</Tab>
          </TabList>

          <TabPanels>
            <TabPanel>
              <QueryInterface />
            </TabPanel>
            <TabPanel>
              <FeedbackDocuments />
            </TabPanel>
          </TabPanels>
        </Tabs>
      </Box>
    </ChakraProvider>
  );
}

export default App; 