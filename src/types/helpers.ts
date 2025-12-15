export interface MemoryContext {
  insights: {
    user_patterns: string[];
    preferences: string[];
    common_queries: string[];
    knowledge_domains: string[];
  };
  context: string;
}

export interface HelperConfig {
  name: string;
  display_name: string;
  description: string;
  system_prompt: string;
  component_key: string;
  available_tools: string[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
  memory?: MemoryContext;
}
