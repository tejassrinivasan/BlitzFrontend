import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Container,
  Flex,
  Heading,
  Stack,
  Text,
  useToast,
  Card,
  CardBody,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Badge,
  Select,
  HStack,
  Input,
  Textarea,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
  Code,
  Alert,
  AlertIcon,
  IconButton,
  Tooltip,
} from '@chakra-ui/react';
import { DownloadIcon, ViewIcon, DeleteIcon } from '@chakra-ui/icons';
import logger from '../utils/logger';

interface LogEntry {
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  category: string;
  message: string;
  data?: any;
  requestId?: string;
}

function LogViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([]);
  const [levelFilter, setLevelFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();

  useEffect(() => {
    refreshLogs();
    
    // Set up interval to refresh logs every 2 seconds
    const interval = setInterval(refreshLogs, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    filterLogs();
  }, [logs, levelFilter, categoryFilter, searchFilter]);

  const refreshLogs = () => {
    const allLogs = logger.getLogs();
    setLogs(allLogs);
  };

  const filterLogs = () => {
    let filtered = [...logs];

    // Filter by level
    if (levelFilter !== 'ALL') {
      filtered = filtered.filter(log => log.level === levelFilter);
    }

    // Filter by category
    if (categoryFilter !== 'ALL') {
      filtered = filtered.filter(log => log.category === categoryFilter);
    }

    // Filter by search text
    if (searchFilter) {
      const search = searchFilter.toLowerCase();
      filtered = filtered.filter(log => 
        log.message.toLowerCase().includes(search) ||
        log.category.toLowerCase().includes(search) ||
        (log.requestId && log.requestId.toLowerCase().includes(search)) ||
        JSON.stringify(log.data || {}).toLowerCase().includes(search)
      );
    }

    // Sort by timestamp (newest first)
    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    setFilteredLogs(filtered);
  };

  const handleClearLogs = () => {
    logger.clearLogs();
    refreshLogs();
    toast({
      title: 'Logs cleared',
      status: 'success',
      duration: 2000,
      isClosable: true,
    });
  };

  const handleExportLogs = () => {
    const logsJson = logger.exportLogs();
    const blob = new Blob([logsJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `blitz-logs-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: 'Logs exported',
      description: 'Logs downloaded as JSON file',
      status: 'success',
      duration: 3000,
      isClosable: true,
    });
  };

  const handleViewLog = (log: LogEntry) => {
    setSelectedLog(log);
    onOpen();
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'ERROR': return 'red';
      case 'WARN': return 'orange';
      case 'INFO': return 'blue';
      case 'DEBUG': return 'gray';
      default: return 'gray';
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'API_REQUEST': return 'green';
      case 'API_RESPONSE': return 'blue';
      case 'API_ERROR': return 'red';
      default: return 'purple';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const getUniqueCategories = () => {
    const categories = [...new Set(logs.map(log => log.category))];
    return categories.sort();
  };

  return (
    <Container maxW="container.xl" py={8}>
      <Stack spacing={6}>
        <Flex justify="space-between" align="center">
          <Box>
            <Heading size="lg">API Log Viewer</Heading>
            <Text color="gray.600" mt={2}>
              Monitor and debug all API requests and responses
            </Text>
          </Box>
          <HStack>
            <Button
              leftIcon={<DownloadIcon />}
              onClick={handleExportLogs}
              colorScheme="blue"
              size="sm"
            >
              Export Logs
            </Button>
            <Button
              leftIcon={<DeleteIcon />}
              onClick={handleClearLogs}
              colorScheme="red"
              variant="outline"
              size="sm"
            >
              Clear Logs
            </Button>
            <Button
              onClick={refreshLogs}
              size="sm"
            >
              Refresh
            </Button>
          </HStack>
        </Flex>

        <Alert status="info">
          <AlertIcon />
          <Box>
            <Text fontWeight="bold">Real-time API Logging</Text>
            <Text fontSize="sm">
              This page shows all API requests made by the application. Logs are automatically updated every 2 seconds 
              and persist in browser storage. Use filters to find specific requests.
            </Text>
          </Box>
        </Alert>

        <Card>
          <CardBody>
            <Stack spacing={4}>
              <HStack spacing={4} wrap="wrap">
                <Box>
                  <Text fontSize="sm" fontWeight="medium" mb={1}>Level Filter:</Text>
                  <Select
                    value={levelFilter}
                    onChange={(e) => setLevelFilter(e.target.value)}
                    size="sm"
                    width="150px"
                  >
                    <option value="ALL">All Levels</option>
                    <option value="ERROR">Error</option>
                    <option value="WARN">Warning</option>
                    <option value="INFO">Info</option>
                    <option value="DEBUG">Debug</option>
                  </Select>
                </Box>

                <Box>
                  <Text fontSize="sm" fontWeight="medium" mb={1}>Category Filter:</Text>
                  <Select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    size="sm"
                    width="180px"
                  >
                    <option value="ALL">All Categories</option>
                    {getUniqueCategories().map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </Select>
                </Box>

                <Box flex="1" minW="200px">
                  <Text fontSize="sm" fontWeight="medium" mb={1}>Search:</Text>
                  <Input
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder="Search logs..."
                    size="sm"
                  />
                </Box>

                <Box>
                  <Text fontSize="sm" fontWeight="medium" mb={1}>Results:</Text>
                  <Badge colorScheme="blue" fontSize="sm" p={1}>
                    {filteredLogs.length} / {logs.length}
                  </Badge>
                </Box>
              </HStack>
            </Stack>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <TableContainer maxHeight="600px" overflowY="auto">
              <Table size="sm" variant="striped">
                <Thead position="sticky" top={0} bg="white" zIndex={1}>
                  <Tr>
                    <Th>Timestamp</Th>
                    <Th>Level</Th>
                    <Th>Category</Th>
                    <Th>Message</Th>
                    <Th>Request ID</Th>
                    <Th>Actions</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {filteredLogs.map((log, index) => (
                    <Tr key={index}>
                      <Td fontSize="xs">
                        {formatTimestamp(log.timestamp)}
                      </Td>
                      <Td>
                        <Badge colorScheme={getLevelColor(log.level)} size="sm">
                          {log.level}
                        </Badge>
                      </Td>
                      <Td>
                        <Badge colorScheme={getCategoryColor(log.category)} variant="outline" size="sm">
                          {log.category}
                        </Badge>
                      </Td>
                      <Td fontSize="sm" maxW="300px" isTruncated>
                        {log.message}
                      </Td>
                      <Td fontSize="xs">
                        {log.requestId && (
                          <Code fontSize="xs">{log.requestId}</Code>
                        )}
                      </Td>
                      <Td>
                        <Tooltip label="View detailed log data">
                          <IconButton
                            aria-label="View log details"
                            icon={<ViewIcon />}
                            size="xs"
                            onClick={() => handleViewLog(log)}
                          />
                        </Tooltip>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableContainer>

            {filteredLogs.length === 0 && (
              <Box textAlign="center" py={8}>
                <Text color="gray.500">
                  {logs.length === 0 ? 'No logs available' : 'No logs match the current filters'}
                </Text>
              </Box>
            )}
          </CardBody>
        </Card>

        {/* Log Detail Modal */}
        <Modal isOpen={isOpen} onClose={onClose} size="4xl">
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>
              Log Details
              {selectedLog && (
                <HStack mt={2}>
                  <Badge colorScheme={getLevelColor(selectedLog.level)}>
                    {selectedLog.level}
                  </Badge>
                  <Badge colorScheme={getCategoryColor(selectedLog.category)} variant="outline">
                    {selectedLog.category}
                  </Badge>
                  {selectedLog.requestId && (
                    <Code fontSize="sm">{selectedLog.requestId}</Code>
                  )}
                </HStack>
              )}
            </ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              {selectedLog && (
                <Stack spacing={4}>
                  <Box>
                    <Text fontWeight="bold" mb={2}>Timestamp:</Text>
                    <Text>{formatTimestamp(selectedLog.timestamp)}</Text>
                  </Box>

                  <Box>
                    <Text fontWeight="bold" mb={2}>Message:</Text>
                    <Text>{selectedLog.message}</Text>
                  </Box>

                  {selectedLog.data && (
                    <Box>
                      <Text fontWeight="bold" mb={2}>Data:</Text>
                      <Textarea
                        value={JSON.stringify(selectedLog.data, null, 2)}
                        readOnly
                        minH="300px"
                        fontFamily="mono"
                        fontSize="sm"
                      />
                    </Box>
                  )}
                </Stack>
              )}
            </ModalBody>
            <ModalFooter>
              <Button onClick={onClose}>Close</Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </Stack>
    </Container>
  );
}

export default LogViewer; 