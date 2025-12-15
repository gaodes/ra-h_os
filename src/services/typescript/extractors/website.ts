/**
 * Website content extraction for RA-H knowledge management system
 * Extracts text content from web pages and returns formatted content
 */

import * as cheerio from 'cheerio';

interface WebsiteMetadata {
  title: string;
  author?: string;
  date?: string;
  description?: string;
  og_image?: string;
  site_name?: string;
  extraction_method?: string;
}

interface ExtractionResult {
  content: string;
  chunk: string;
  metadata: WebsiteMetadata;
  url: string;
}

export class WebsiteExtractor {
  private headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  };

  /**
   * Clean extracted content for better readability
   */
  private cleanContent(content: string): string {
    // Remove excessive whitespace
    content = content.replace(/\s+/g, ' ').trim();
    
    // Remove cookie/privacy policy mentions
    content = content.replace(/cookie\s+policy|privacy\s+policy|terms\s+of\s+service/gi, '');
    
    // Split into paragraphs and clean
    const paragraphs = content
      .split('\n')
      .map(p => p.trim())
      .filter(p => p.length > 20); // Remove very short paragraphs (likely nav/UI)
    
    return paragraphs.join('\n\n');
  }

  /**
   * Extract metadata from HTML
   */
  private extractMetadata($: cheerio.CheerioAPI): WebsiteMetadata {
    const metadata: WebsiteMetadata = {
      title: '',
    };
    
    // Title extraction (priority order)
    metadata.title = 
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('title').text() ||
      $('h1').first().text() ||
      'Untitled';
    
    // Author extraction
    metadata.author = 
      $('meta[name="author"]').attr('content') ||
      $('meta[property="article:author"]').attr('content') ||
      $('.author').first().text() ||
      $('[rel="author"]').first().text() ||
      undefined;
    
    // Date extraction
    metadata.date = 
      $('meta[property="article:published_time"]').attr('content') ||
      $('meta[name="publish_date"]').attr('content') ||
      $('time').first().attr('datetime') ||
      $('.date').first().text() ||
      undefined;
    
    // Description
    metadata.description = 
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      undefined;
    
    // Image
    metadata.og_image = 
      $('meta[property="og:image"]').attr('content') ||
      undefined;
    
    // Site name
    metadata.site_name = 
      $('meta[property="og:site_name"]').attr('content') ||
      undefined;
    
    return metadata;
  }

  /**
   * Extract main content from HTML
   */
  private extractMainContent($: cheerio.CheerioAPI): string {
    // Remove script and style elements
    $('script, style, noscript').remove();
    
    // Remove common navigation and footer elements
    $('nav, header, footer, aside, .nav, .header, .footer, .sidebar, .menu, .advertisement').remove();
    
    // Try to find main content areas (in priority order)
    const contentSelectors = [
      'main',
      'article',
      '[role="main"]',
      '.content',
      '.post',
      '.article-body',
      '.entry-content',
      '#content',
      '.container',
      'body',
    ];
    
    let mainContent = '';
    
    for (const selector of contentSelectors) {
      const element = $(selector).first();
      if (element.length > 0) {
        // Extract text from paragraphs, headings, lists
        const textElements = element.find('p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th');
        
        if (textElements.length > 0) {
          const texts: string[] = [];
          textElements.each((_, el) => {
            const text = $(el).text().trim();
            if (text.length > 0) {
              texts.push(text);
            }
          });
          
          if (texts.length > 0) {
            mainContent = texts.join('\n\n');
            break;
          }
        }
      }
    }
    
    // Fallback to all text if no main content found
    if (!mainContent) {
      mainContent = $('body').text();
    }
    
    return this.cleanContent(mainContent);
  }

  /**
   * Format content for node creation
   */
  private formatContent(metadata: WebsiteMetadata, mainContent: string): string {
    const sections: string[] = [];
    
    // Add metadata section
    sections.push('## Article Information');
    sections.push(`**Title:** ${metadata.title}`);
    
    if (metadata.author) {
      sections.push(`**Author:** ${metadata.author}`);
    }
    
    if (metadata.date) {
      sections.push(`**Date:** ${metadata.date}`);
    }
    
    if (metadata.site_name) {
      sections.push(`**Source:** ${metadata.site_name}`);
    }
    
    if (metadata.description) {
      sections.push(`**Description:** ${metadata.description}`);
    }
    
    sections.push('');
    
    // Add main content
    sections.push('## Content');
    sections.push(mainContent);
    
    return sections.join('\n');
  }

  /**
   * Main extraction method
   */
  async extract(url: string): Promise<ExtractionResult> {
    // Validate URL
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      throw new Error('Invalid URL format - must start with http:// or https://');
    }
    
    try {
      // Fetch the webpage
      const response = await fetch(url, {
        headers: this.headers,
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const html = await response.text();
      
      // Parse HTML with cheerio
      const $ = cheerio.load(html);
      
      // Extract metadata and content
      const metadata = this.extractMetadata($);
      // Mark extraction method for downstream metadata
      metadata.extraction_method = 'typescript_cheerio';
      const mainContent = this.extractMainContent($);
      
      // Format content for display
      const content = this.formatContent(metadata, mainContent);
      
      // Chunk is the main content text
      const chunk = mainContent;
      
      return {
        content,
        chunk,
        metadata,
        url,
      };
      
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error('Request timeout - website took too long to respond');
      }
      throw error;
    }
  }
}

/**
 * Standalone extraction function for direct use
 */
export async function extractWebsite(url: string): Promise<ExtractionResult> {
  const extractor = new WebsiteExtractor();
  return extractor.extract(url);
}

/**
 * CLI interface for direct execution
 */
export async function runCLI(args: string[]): Promise<void> {
  if (args.length === 0) {
    console.error('Usage: website-extract <url>');
    process.exit(1);
  }
  
  const url = args[0];
  
  try {
    const result = await extractWebsite(url);
    // Output as JSON for compatibility with existing tools
    console.log(JSON.stringify(result, null, 2));
  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Run if called directly (for testing)
if (require.main === module) {
  runCLI(process.argv.slice(2)).catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}
