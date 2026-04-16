import { z } from 'zod';

// Add key rotation utility at the top of the file, before the webScraper tool
interface ApiKey {
  key: string;
  requestCount: number;
  maxRequestsPerMonth: number;
}

class KeyRotationManager {
  private keys: ApiKey[];
  private currentKeyIndex: number;

  constructor(keys: string[], maxRequestsPerMonth: number = 300) {
    this.keys = keys.map(key => ({
      key,
      requestCount: 0,
      maxRequestsPerMonth
    }));
    this.currentKeyIndex = 0;
  }

  getNextAvailableKey(): string {
    const totalKeys = this.keys.length;
    
    // Try to find an available key in one full rotation
    for (let i = 0; i < totalKeys; i++) {
      const currentKey = this.keys[this.currentKeyIndex];
      
      // If current key hasn't reached max requests, use it
      if (currentKey.requestCount < currentKey.maxRequestsPerMonth) {
        currentKey.requestCount++;
        return currentKey.key;
      }
      
      // Move to next key
      this.currentKeyIndex = (this.currentKeyIndex + 1) % totalKeys;
    }
    
    // If all keys are exhausted, throw an error
    throw new Error('All API keys have reached their monthly request limit');
  }

  resetMonthlyCount() {
    this.keys.forEach(key => {
      key.requestCount = 0;
    });
  }
}

// Initialize key rotation managers for web scraping and web search
const webScraperKeyManager = new KeyRotationManager([
  'ns11vfr6jiguh1gdantb583crpp87d818d7cju3arklon90fv4aspag',
  'qlh3lj31a5onoqdu7arq9opupumimjo8uisbq6f3ga8pumabumj7n',
  'h1ahqt8unmoruj1ugndr6gd4bacveb3ssok0l89hq6oeip17topu48'
]);

const webSearchKeyManager = new KeyRotationManager(
  (process.env.TAVILY_API_KEYS || '').split(',').filter(Boolean)
);

/**
 * Clean and format scraped content
 * @param {string} url - The URL that was scraped
 * @param {string} content - The raw HTML content
 * @returns {string} Cleaned and formatted content
 */
function cleanWebContent(url: string, content: string): string {
  // Remove excessive whitespace
  const cleanedContent = content
    .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
    .replace(/\n+/g, ' ')  // Replace multiple newlines with single space
    .trim();
  
  // REMOVED: Truncate to 1500 characters
  // const truncatedContent = cleanedContent.substring(0, 1500);
  
  // Create markdown-formatted output
  return `### Web Content from ${url}

${cleanedContent}`;
}

/**
 * Web scraping tool that uses anyapi.io to extract content from websites
 */
export const webScraper = {
  description: 'Scrape content from a website',
  inputSchema: z.object({
    url: z.string().url().describe('The URL of the website to scrape. Must be a valid URL with http:// or https:// prefix.')
  }),
  execute: async ({ url }: { url: string }) => {
    try {
      console.log(`Scraping content from: ${url}`);
      
      // Select the least used API key
      const apiKey = webScraperKeyManager.getNextAvailableKey();
      
      // Construct the API URL with proper encoding
      const apiUrl = `https://anyapi.io/api/v1/scrape?url=${encodeURIComponent(url)}&apiKey=${apiKey}`;
      
      // Make the request to the API
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Scraping failed with status: ${response.status}`);
      }
      
      // Parse the response
      const data = await response.json();
      
      // Clean and format the content
      const cleanedContent = cleanWebContent(url, data.content);
      
      return {
        success: true,
        message: `Content scraped successfully from ${url}`,
        cleanResults: cleanedContent,
        metadata: {
          url,
          timestamp: new Date().toISOString(),
          apiKeyUsed: apiKey
        }
      };
    } catch (error) {
      console.error('Web scraper tool error:', error);
      
      return { 
        success: false,
        error: 'Failed to scrape website content',
        message: typeof error === 'object' && error !== null && 'message' in error ? (error as any).message : String(error),
        metadata: {
          url,
          timestamp: new Date().toISOString()
        }
      };
    }
  }
};
