import { useState, useEffect } from 'react';
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
  Select,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Badge,
  Spinner,
  Alert,
  AlertIcon,
  HStack,
} from '@chakra-ui/react';
import { generateInsights, startConversation, getAvailableDatabases, executeQuery } from './services/api';
import type { ApiResponse, QueryResult } from './types/api';
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
          AI Query Interface
        </Heading>
        
        <Card>
          <CardBody>
            <VStack spacing={4}>
              <Text fontWeight="bold" alignSelf="flex-start">Ask a Question:</Text>
              <Textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Enter your sports-related question here...&#10;&#10;Example: What were the top 5 highest scoring games in the NBA this season?"
                size="lg"
                minHeight="120px"
              />
              <HStack spacing={4}>
                <Button
                  colorScheme="blue"
                  onClick={handleGenerateInsights}
                  isLoading={loading}
                  size="lg"
                >
                  Generate Insights
                </Button>
                <Button
                  colorScheme="green"
                  onClick={handleStartConversation}
                  isLoading={loading}
                  size="lg"
                >
                  Start Conversation
                </Button>
              </HStack>
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
                          fontSize="sm"
                        >
                          {response.sql_query}
                        </Box>
                        <Text fontSize="sm" color="gray.600">
                          💡 Copy this query to the "SQL Query Runner" tab to execute it against your database.
                        </Text>
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

function SQLQueryRunner() {
  const [databases, setDatabases] = useState<string[]>([]);
  const [selectedDatabase, setSelectedDatabase] = useState('');
  const [sqlQuery, setSqlQuery] = useState('');
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    loadDatabases();
  }, []);

  const loadDatabases = async () => {
    try {
      const result = await getAvailableDatabases();
      setDatabases(result.databases);
      if (result.databases.length > 0) {
        setSelectedDatabase(result.databases[0]);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load available databases',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const handleRunQuery = async () => {
    if (!sqlQuery.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a SQL query',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    if (!selectedDatabase) {
      toast({
        title: 'Error',
        description: 'Please select a database',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    setQueryLoading(true);
    try {
      const result = await executeQuery({
        database: selectedDatabase,
        query: sqlQuery,
      });
      setQueryResult(result);
      
      if (result.success) {
        toast({
          title: 'Success',
          description: `Query executed successfully. ${result.row_count} rows returned.`,
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
      } else {
        toast({
          title: 'Query Error',
          description: result.error || 'Query execution failed',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to execute query',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setQueryLoading(false);
    }
  };

  return (
    <Box p={8}>
      <VStack spacing={6} align="stretch">
        <Heading as="h1" size="xl" textAlign="center">
          SQL Query Runner
        </Heading>
        
        <Card>
          <CardBody>
            <VStack spacing={4}>
              <HStack spacing={4} width="100%" justifyContent="space-between">
                <HStack>
                  <Text fontWeight="bold">Database:</Text>
                  <Select
                    value={selectedDatabase}
                    onChange={(e) => setSelectedDatabase(e.target.value)}
                    width="250px"
                  >
                    {databases.map((db) => (
                      <option key={db} value={db}>
                        {db.toUpperCase()} Database
                      </option>
                    ))}
                  </Select>
                </HStack>
                <Button
                  colorScheme="purple"
                  onClick={handleRunQuery}
                  isLoading={queryLoading}
                  size="lg"
                >
                  Run Query
                </Button>
              </HStack>
              
              <Textarea
                value={sqlQuery}
                onChange={(e) => setSqlQuery(e.target.value)}
                placeholder="Enter your SQL query here...&#10;&#10;Examples:&#10;SELECT * FROM players LIMIT 10;&#10;SELECT team_name, wins, losses FROM teams ORDER BY wins DESC;"
                size="lg"
                fontFamily="mono"
                minHeight="200px"
              />
            </VStack>
          </CardBody>
        </Card>

        {queryResult && (
          <Card>
            <CardBody>
              <VStack align="stretch" spacing={4}>
                <HStack>
                  <Text fontWeight="bold">Query Results:</Text>
                  <Badge colorScheme={queryResult.success ? 'green' : 'red'} size="lg">
                    {queryResult.success ? 'Success' : 'Error'}
                  </Badge>
                  {queryResult.success && (
                                         <Text fontSize="sm" color="gray.600">
                       {queryResult.row_count} rows • Database: {queryResult.database?.toUpperCase()} Database
                     </Text>
                  )}
                </HStack>

                {!queryResult.success ? (
                  <Alert status="error">
                    <AlertIcon />
                    {queryResult.error}
                  </Alert>
                ) : queryResult.data && queryResult.data.length > 0 ? (
                  <TableContainer maxHeight="500px" overflowY="auto">
                    <Table size="sm" variant="striped" colorScheme="gray">
                      <Thead bg="gray.100" position="sticky" top={0} zIndex={1}>
                        <Tr>
                          {queryResult.columns?.map((column) => (
                            <Th key={column} fontWeight="bold" fontSize="sm">
                              {column}
                            </Th>
                          ))}
                        </Tr>
                      </Thead>
                      <Tbody>
                        {queryResult.data.slice(0, 1000).map((row, index) => (
                          <Tr key={index}>
                            {queryResult.columns?.map((column) => (
                              <Td key={column} fontSize="sm">
                                {row[column] !== null && row[column] !== undefined 
                                  ? String(row[column]) 
                                  : '-'}
                              </Td>
                            ))}
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </TableContainer>
                ) : (
                  <Alert status="info">
                    <AlertIcon />
                    No data returned from query.
                  </Alert>
                )}

                {queryResult.message && (
                  <Alert status="info">
                    <AlertIcon />
                    {queryResult.message}
                  </Alert>
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
            <Tab>AI Query Interface</Tab>
            <Tab>SQL Query Runner</Tab>
            <Tab>Feedback Documents</Tab>
          </TabList>

          <TabPanels>
            <TabPanel>
              <QueryInterface />
            </TabPanel>
            <TabPanel>
              <SQLQueryRunner />
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