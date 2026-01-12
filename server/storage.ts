// Storage interface for the agenda assistant
// Currently using in-memory storage, no persistent data needed

export interface IStorage {
  // No persistent storage needed for this service
  // Config is loaded from config.json
  // No state needs to be persisted between requests
}

export class MemStorage implements IStorage {
  constructor() {
    // No initialization needed
  }
}

export const storage = new MemStorage();
