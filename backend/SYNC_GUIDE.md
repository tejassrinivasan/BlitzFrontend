# Azure Search Index Sync Tool

This script helps you synchronize your Azure Search index (`blitz-nba-index`) with your CosmosDB NBA Official container by identifying and removing orphaned documents.

## What it does

1. **Compares** documents between:
   - CosmosDB NBA Official container (`nba-official`)  
   - Azure Search index (`blitz-nba-index`)

2. **Identifies orphaned documents** that exist in the search index but not in CosmosDB

3. **Interactive cleanup** - shows you each orphaned document and lets you decide whether to delete it

## Prerequisites

Make sure you have the following environment variables set:

```bash
# CosmosDB
COSMOSDB_ENDPOINT=https://your-cosmos.documents.azure.com:443/

# Azure Search  
AZURE_SEARCH_ENDPOINT=https://your-search-service.search.windows.net
AZURE_SEARCH_API_KEY=your-search-api-key

# Azure Identity (for CosmosDB auth)
# Make sure you're logged in with Azure CLI or have appropriate credentials
```

## Usage

1. **Navigate to the backend directory:**
   ```bash
   cd backend
   ```

2. **Run the sync script:**
   ```bash
   python sync_search_index.py
   ```

3. **Follow the interactive prompts:**
   - The script will analyze both data sources
   - Show you any orphaned documents found
   - For each orphaned document, display:
     - Document ID
     - UserPrompt preview
     - Query preview
     - Other metadata
   - Ask for your confirmation before deleting

4. **Confirmation options:**
   - `y` or `yes` - Delete this document
   - `n` or `no` - Skip this document  
   - `s` or `skip` - Skip all remaining documents
   - `q` or `quit` - Cancel the entire operation

## Example Output

```
=============================================================
AZURE SEARCH INDEX SYNC TOOL
NBA Official CosmosDB ↔ blitz-nba-index
=============================================================
✓ Connected to CosmosDB container: nba-official
✓ Connected to Azure Search index: blitz-nba-index

📄 Fetching documents from CosmosDB container: nba-official
✓ Found 1,234 documents in CosmosDB

🔍 Fetching documents from Azure Search index
✓ Found 1,240 documents in Azure Search

=============================================================
ANALYZING DOCUMENT DIFFERENCES
=============================================================

📊 COMPARISON RESULTS:
  CosmosDB documents: 1,234
  Search index documents: 1,240
  Orphaned documents (in search only): 6

=============================================================
ORPHANED DOCUMENTS REVIEW (6 found)
=============================================================
These documents exist in Azure Search but not in CosmosDB:

[1/6] Document ID: abc123-orphaned-doc
--------------------------------------------------
UserPrompt: What is the average points per game for...
Query: SELECT AVG(points) FROM player_stats WHERE...
_ts: 1699123456

🗑️  Delete this document from search index?
Enter [y]es, [n]o, [s]kip remaining, or [q]uit: y
Deleting document abc123-orphaned-doc...
✅ Successfully deleted abc123-orphaned-doc

[2/6] Document ID: def456-another-doc
...
```

## Safety Features

- **Preview before delete**: See document content before deciding
- **Individual confirmation**: Each document requires explicit confirmation
- **Bulk skip option**: Skip remaining documents if needed
- **Cancel anytime**: Quit operation safely at any point
- **Summary report**: See what was deleted/skipped at the end

## Notes

- This script only handles **orphaned documents** (in search but not in CosmosDB)
- Documents missing from search index (in CosmosDB but not in search) are reported but not handled
- All deletions are from the search index only - CosmosDB is never modified
- The script is safe to run multiple times

## Troubleshooting

**Permission Issues:**
- Make sure you're authenticated with Azure CLI: `az login`
- Verify your account has access to both CosmosDB and Azure Search

**Connection Issues:**
- Check your environment variables are set correctly
- Verify network connectivity to Azure services

**No Documents Found:**
- Verify container names and index names are correct
- Check that documents actually exist in both systems
