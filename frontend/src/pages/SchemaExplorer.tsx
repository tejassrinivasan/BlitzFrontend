import React, { useState, useEffect } from 'react';
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
  Spinner,
  Alert,
  AlertIcon,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Select,
  HStack,
} from '@chakra-ui/react';
import { executeQuery } from '../services/api';

interface BettingTypeData {
  betting_bet_type_id: number;
  betting_bet_type: string;
  betting_outcome_type_id: number;
  betting_outcome_type: string;
}

function SchemaExplorer() {
  const [bettingData, setBettingData] = useState<BettingTypeData[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDatabase, setSelectedDatabase] = useState('nba');
  const toast = useToast();

  const fetchBettingData = async () => {
    setLoading(true);
    try {
      const query = `
        SELECT DISTINCT 
            betting_bet_type_id,
            betting_bet_type,
            betting_outcome_type_id,
            betting_outcome_type
        FROM bettingdata 
        WHERE betting_bet_type_id IS NOT NULL 
            AND betting_bet_type IS NOT NULL 
            AND betting_outcome_type_id IS NOT NULL 
            AND betting_outcome_type IS NOT NULL
        ORDER BY betting_bet_type_id, betting_outcome_type_id
      `;

      const result = await executeQuery({
        database: selectedDatabase,
        query: query.trim()
      });

      if (result.success && result.data) {
        setBettingData(result.data as BettingTypeData[]);
        toast({
          title: 'Data loaded successfully',
          description: `Found ${result.data.length} unique betting combinations`,
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
      } else {
        throw new Error(result.error || 'Failed to fetch data');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch betting data',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBettingData();
  }, [selectedDatabase]);

  const groupedBettingData = bettingData.reduce((acc, item) => {
    const betType = `${item.betting_bet_type_id} - ${item.betting_bet_type}`;
    if (!acc[betType]) {
      acc[betType] = [];
    }
    acc[betType].push(item);
    return acc;
  }, {} as Record<string, BettingTypeData[]>);

  return (
    <Container maxW="container.xl" py={8}>
      <Stack spacing={6}>
        <Flex justify="space-between" align="center">
          <Box>
            <Heading size="lg">Schema Explorer</Heading>
            <Text color="gray.600" mt={2}>
              Explore interesting tables and schema information from the database
            </Text>
          </Box>
          <HStack>
            <Text fontSize="sm" fontWeight="medium">Database:</Text>
            <Select
              value={selectedDatabase}
              onChange={(e) => setSelectedDatabase(e.target.value)}
              width="140px"
              size="sm"
            >
              <option value="mlb">MLB Database</option>
              <option value="nba">NBA Database</option>
            </Select>
            <Button
              colorScheme="blue"
              onClick={fetchBettingData}
              isLoading={loading}
              size="sm"
            >
              Refresh
            </Button>
          </HStack>
        </Flex>

        <Tabs>
          <TabList>
            <Tab>Betting Types & Outcomes</Tab>
            <Tab isDisabled>More Tables Coming Soon</Tab>
          </TabList>

          <TabPanels>
            <TabPanel>
              {loading ? (
                <Flex justify="center" align="center" minH="200px">
                  <Stack align="center" spacing={3}>
                    <Spinner size="xl" color="blue.500" />
                    <Text color="gray.600">Loading betting data...</Text>
                  </Stack>
                </Flex>
              ) : bettingData.length > 0 ? (
                <Stack spacing={6}>
                  <Alert status="info">
                    <AlertIcon />
                    <Box>
                      <Text fontWeight="bold">Betting Types & Outcome Types</Text>
                      <Text fontSize="sm">
                        This table shows all unique combinations of betting bet types and outcome types 
                        from the {selectedDatabase.toUpperCase()} database. Found {bettingData.length} total combinations 
                        across {Object.keys(groupedBettingData).length} different bet types.
                      </Text>
                    </Box>
                  </Alert>

                  <Card>
                    <CardBody>
                      <TableContainer maxHeight="600px" overflowY="auto">
                        <Table size="sm" variant="striped" colorScheme="gray">
                          <Thead bg="gray.100" position="sticky" top={0} zIndex={1}>
                            <Tr>
                              <Th fontWeight="bold">Bet Type ID</Th>
                              <Th fontWeight="bold">Bet Type</Th>
                              <Th fontWeight="bold">Outcome Type ID</Th>
                              <Th fontWeight="bold">Outcome Type</Th>
                            </Tr>
                          </Thead>
                          <Tbody>
                            {Object.entries(groupedBettingData).map(([betType, outcomes]) => (
                              <React.Fragment key={betType}>
                                {outcomes.map((item, index) => (
                                  <Tr key={`${item.betting_bet_type_id}-${item.betting_outcome_type_id}`}>
                                    <Td>
                                      <Badge colorScheme="blue" variant="subtle">
                                        {item.betting_bet_type_id}
                                      </Badge>
                                    </Td>
                                    <Td fontWeight={index === 0 ? "medium" : "normal"}>
                                      {item.betting_bet_type}
                                    </Td>
                                    <Td>
                                      <Badge 
                                        colorScheme={
                                          item.betting_outcome_type === 'Over' || item.betting_outcome_type === 'Yes' ? 'green' :
                                          item.betting_outcome_type === 'Under' || item.betting_outcome_type === 'No' ? 'red' :
                                          item.betting_outcome_type === 'Home' ? 'purple' :
                                          item.betting_outcome_type === 'Away' ? 'orange' :
                                          'gray'
                                        }
                                        variant="subtle"
                                      >
                                        {item.betting_outcome_type_id}
                                      </Badge>
                                    </Td>
                                    <Td>
                                      <Text 
                                        color={
                                          item.betting_outcome_type === 'Over' || item.betting_outcome_type === 'Yes' ? 'green.600' :
                                          item.betting_outcome_type === 'Under' || item.betting_outcome_type === 'No' ? 'red.600' :
                                          'inherit'
                                        }
                                        fontWeight="medium"
                                      >
                                        {item.betting_outcome_type}
                                      </Text>
                                    </Td>
                                  </Tr>
                                ))}
                              </React.Fragment>
                            ))}
                          </Tbody>
                        </Table>
                      </TableContainer>
                    </CardBody>
                  </Card>

                  <Box>
                    <Text fontSize="sm" color="gray.600">
                      💡 <strong>Tip:</strong> This data comes from the `bettingdata` table in the {selectedDatabase.toUpperCase()} database. 
                      Each row represents a unique combination of betting market types and their possible outcomes.
                    </Text>
                  </Box>
                </Stack>
              ) : (
                <Alert status="warning">
                  <AlertIcon />
                  No betting data found. Try refreshing or check the database connection.
                </Alert>
              )}
            </TabPanel>

            <TabPanel>
              <Alert status="info">
                <AlertIcon />
                <Box>
                  <Text fontWeight="bold">More Schema Tables Coming Soon!</Text>
                  <Text fontSize="sm">
                    We'll be adding more interesting schema explorations here, such as:
                  </Text>
                  <Box as="ul" mt={2} ml={4}>
                    <li>Player position distributions</li>
                    <li>Team conference mappings</li>
                    <li>Game type classifications</li>
                    <li>Season type breakdowns</li>
                  </Box>
                </Box>
              </Alert>
            </TabPanel>
          </TabPanels>
        </Tabs>
      </Stack>
    </Container>
  );
}

export default SchemaExplorer; 