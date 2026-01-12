import fetch from "node-fetch";
import type { MiroShapeItem, MiroConnector, MindmapNode, AppConfig } from "@shared/schema";

interface MiroApiResponse {
  data: Array<{
    id: string;
    type: string;
    data?: {
      content?: string;
      shape?: string;
    };
    position?: {
      x: number;
      y: number;
    };
    parent?: {
      id: string;
    };
  }>;
  cursor?: string;
}

interface MiroConnectorsResponse {
  data: Array<{
    id: string;
    startItem?: { id: string };
    endItem?: { id: string };
  }>;
  cursor?: string;
}

export class MiroService {
  private config: AppConfig["miro"];
  private baseUrl = "https://api.miro.com/v2";

  constructor(config: AppConfig["miro"]) {
    this.config = config;
  }

  private async fetchWithAuth(endpoint: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      headers: {
        "Authorization": `Bearer ${this.config.accessToken}`,
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Miro API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  async fetchAllItems(): Promise<MiroShapeItem[]> {
    const items: MiroShapeItem[] = [];
    let cursor: string | undefined;

    do {
      const endpoint = `/boards/${this.config.boardId}/items${cursor ? `?cursor=${cursor}` : ""}`;
      const response: MiroApiResponse = await this.fetchWithAuth(endpoint);

      for (const item of response.data) {
        if (item.type === "shape" || item.type === "text" || item.type === "sticky_note") {
          items.push({
            id: item.id,
            type: item.type,
            content: this.cleanContent(item.data?.content || ""),
            parentId: item.parent?.id,
            position: {
              x: item.position?.x || 0,
              y: item.position?.y || 0,
            },
          });
        }
      }

      cursor = response.cursor;
    } while (cursor);

    return items;
  }

  async fetchConnectors(): Promise<MiroConnector[]> {
    const connectors: MiroConnector[] = [];
    let cursor: string | undefined;

    do {
      const endpoint = `/boards/${this.config.boardId}/connectors${cursor ? `?cursor=${cursor}` : ""}`;
      const response: MiroConnectorsResponse = await this.fetchWithAuth(endpoint);

      for (const connector of response.data) {
        connectors.push({
          id: connector.id,
          startItem: connector.startItem,
          endItem: connector.endItem,
        });
      }

      cursor = response.cursor;
    } while (cursor);

    return connectors;
  }

  private cleanContent(html: string): string {
    // Remove HTML tags and decode entities
    return html
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }

  async getSecondLevelBlocks(): Promise<string[]> {
    try {
      const items = await this.fetchAllItems();
      const connectors = await this.fetchConnectors();

      // Find the target widget "Ключевые векторы" - first by ID, then by content
      let targetWidget = items.find(item => item.id === this.config.targetWidgetId);
      
      if (!targetWidget) {
        console.log("Target widget not found by ID, searching by content...");
        targetWidget = items.find(item => 
          item.content.toLowerCase().includes("ключевые векторы")
        );
      }

      if (!targetWidget) {
        throw new Error("Widget 'Ключевые векторы' не найден на доске");
      }

      // Build connection graph
      const childrenMap = new Map<string, string[]>();
      
      for (const connector of connectors) {
        if (connector.startItem && connector.endItem) {
          const startId = connector.startItem.id;
          const endId = connector.endItem.id;
          
          // Add bidirectional for now, we'll determine direction later
          if (!childrenMap.has(startId)) {
            childrenMap.set(startId, []);
          }
          childrenMap.get(startId)!.push(endId);
        }
      }

      // Find 1st level children (directly connected to target)
      const targetId = targetWidget.id;
      const firstLevelIds = childrenMap.get(targetId) || [];

      // Find 2nd level children (connected to 1st level)
      const secondLevelIds = new Set<string>();
      for (const firstLevelId of firstLevelIds) {
        const children = childrenMap.get(firstLevelId) || [];
        for (const childId of children) {
          if (childId !== targetId && !firstLevelIds.includes(childId)) {
            secondLevelIds.add(childId);
          }
        }
      }

      // Get content of 2nd level items
      const secondLevelBlocks: string[] = [];
      for (const item of items) {
        if (secondLevelIds.has(item.id) && item.content) {
          secondLevelBlocks.push(item.content);
        }
      }

      // If no connectors found, try position-based hierarchy
      if (secondLevelBlocks.length === 0 && targetWidget) {
        console.log("No connectors found, trying position-based approach...");
        return this.getChildrenByPosition(items, targetWidget);
      }

      return secondLevelBlocks;
    } catch (error) {
      console.error("Miro error:", error);
      throw new Error(`Ошибка при получении данных из Miro: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private getChildrenByPosition(items: MiroShapeItem[], rootItem: MiroShapeItem): string[] {
    // Sort items by distance from root and group by approximate levels
    const itemsWithDistance = items
      .filter(item => item.id !== rootItem.id && item.content)
      .map(item => ({
        ...item,
        distance: Math.sqrt(
          Math.pow(item.position.x - rootItem.position.x, 2) +
          Math.pow(item.position.y - rootItem.position.y, 2)
        ),
      }))
      .sort((a, b) => a.distance - b.distance);

    // Assume items at similar distances are same level
    // Take items in the "second band" of distances
    if (itemsWithDistance.length < 2) {
      return itemsWithDistance.map(i => i.content);
    }

    // Simple heuristic: first few items are level 1, next batch is level 2
    const level1Count = Math.min(5, Math.floor(itemsWithDistance.length / 3));
    const level2Items = itemsWithDistance.slice(level1Count, level1Count + 10);

    return level2Items.map(item => item.content);
  }

  async formatMiroSection(): Promise<string> {
    const blocks = await this.getSecondLevelBlocks();
    
    if (blocks.length === 0) {
      return "Фокус на:\nБлоки 2-го уровня не найдены";
    }

    const lines = blocks.map((block, index) => `${index + 1}. ${block}`);
    return `Фокус на:\n${lines.join("\n")}`;
  }
}
