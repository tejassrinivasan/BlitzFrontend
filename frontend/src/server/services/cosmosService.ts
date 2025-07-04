import { CosmosClient } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';

export interface FeedbackDocument {
  id?: string;
  UserPrompt: string;
  Query: string;
  UserPromptVector?: number[];
  QueryVector?: number[];
  _ts?: number;
}

class CosmosService {
  private client: CosmosClient;
  private database: string;
  private container: string;
  private unofficialContainer: string;

  constructor() {
    const credential = new DefaultAzureCredential();
    const endpoint = process.env.COSMOSDB_ENDPOINT || '';
    
    this.client = new CosmosClient({
      endpoint,
      aadCredential: credential
    });
    
    this.database = "sports";
    this.container = "mlb";
    this.unofficialContainer = "mlb-user-feedback";
  }

  private getContainer(isOfficial: boolean = true) {
    return this.client
      .database(this.database)
      .container(isOfficial ? this.container : this.unofficialContainer);
  }

  async getDocuments(page: number = 1, limit: number = 20, isOfficial: boolean = true) {
    const container = this.getContainer(isOfficial);
    
    const querySpec = {
      query: "SELECT * FROM c ORDER BY c._ts DESC OFFSET @offset LIMIT @limit",
      parameters: [
        { name: "@offset", value: (page - 1) * limit },
        { name: "@limit", value: limit }
      ]
    };

    const { resources } = await container.items
      .query(querySpec)
      .fetchAll();

    return resources;
  }

  async searchDocuments(searchTerm: string, isOfficial: boolean = true) {
    const container = this.getContainer(isOfficial);
    
    const querySpec = {
      query: "SELECT * FROM c WHERE CONTAINS(LOWER(c.UserPrompt), LOWER(@searchTerm)) ORDER BY c._ts DESC",
      parameters: [
        { name: "@searchTerm", value: searchTerm.toLowerCase() }
      ]
    };

    const { resources } = await container.items
      .query(querySpec)
      .fetchAll();

    return resources;
  }

  async createDocument(doc: Omit<FeedbackDocument, 'id'>, isOfficial: boolean = true) {
    const container = this.getContainer(isOfficial);
    const { resource } = await container.items.create(doc);
    return resource;
  }

  async updateDocument(id: string, doc: Partial<FeedbackDocument>, isOfficial: boolean = true) {
    const container = this.getContainer(isOfficial);
    const { resource } = await container.item(id, id).replace(doc);
    return resource;
  }

  async deleteDocument(id: string, isOfficial: boolean = true) {
    const container = this.getContainer(isOfficial);
    await container.item(id, id).delete();
  }

  async transferDocument(id: string) {
    // Get document from unofficial container
    const unofficialContainer = this.getContainer(false);
    const { resource: doc } = await unofficialContainer.item(id, id).read();
    
    if (!doc) {
      throw new Error('Document not found');
    }

    // Create in official container
    const officialContainer = this.getContainer(true);
    const { resource: newDoc } = await officialContainer.items.create(doc);

    // Delete from unofficial container
    await unofficialContainer.item(id, id).delete();

    return newDoc;
  }
}

export const cosmosService = new CosmosService(); 