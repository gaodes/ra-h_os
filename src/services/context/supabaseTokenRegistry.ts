/**
 * Stub for SupabaseTokenRegistry - not used in open source version
 * The private version uses this for backend API authentication.
 * In open source mode, all API calls go directly to OpenAI/Anthropic.
 */
export class SupabaseTokenRegistry {
  static async get(_key: string): Promise<string | null> {
    return null;
  }
  
  static getLast(_key: string): string | null {
    return null;
  }
  
  static set(_key: string, _value: string): void {
    // No-op in OS version
  }
  
  static delete(_key: string): void {
    // No-op in OS version
  }
}
