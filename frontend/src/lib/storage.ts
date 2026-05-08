/**
 * Web-only storage using localStorage for the simplified PINIT platform
 */

export const appStorage = {
  /**
   * Set a value in persistent storage
   */
  async setItem(key: string, value: string): Promise<void> {
    try {
      localStorage.setItem(key, value);
      console.log(`✅ Storage: Saved to localStorage - ${key}`);
    } catch (error) {
      console.error(`❌ Storage: localStorage save failed:`, error);
      throw new Error(`Failed to save ${key} to localStorage`);
    }
  },

  /**
   * Get a value from persistent storage
   */
  async getItem(key: string): Promise<string | null> {
    try {
      const value = localStorage.getItem(key);
      if (value !== null) {
        console.log(`✅ Storage: Retrieved from localStorage - ${key}`);
        return value;
      }
    } catch (error) {
      console.error(`❌ Storage: localStorage retrieval failed:`, error);
    }

    console.log(`⚠️ Storage: Key not found - ${key}`);
    return null;
  },

  /**
   * Remove a value from persistent storage
   */
  async removeItem(key: string): Promise<void> {
    try {
      localStorage.removeItem(key);
      console.log(`✅ Storage: Removed from localStorage - ${key}`);
    } catch (error) {
      console.error(`❌ Storage: localStorage removal failed:`, error);
    }
  },

  /**
   * Clear all app storage
   */
  async clear(): Promise<void> {
    try {
      localStorage.clear();
      console.log(`✅ Storage: Cleared localStorage`);
    } catch (error) {
      console.error(`❌ Storage: localStorage clear failed`, error);
    }
  },
};
