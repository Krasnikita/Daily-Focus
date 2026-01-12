import fetch from "node-fetch";
import type { MindmapNode, AppConfig } from "@shared/schema";

interface MindmapNodeResponse {
  id: string;
  type: string;
  data?: {
    isRoot?: boolean;
    nodeView?: {
      type: string;
      data?: {
        content?: string;
      };
    };
  };
  parent?: {
    id: string;
  };
}

interface MindmapNodesApiResponse {
  data: MindmapNodeResponse[];
  size: number;
  total: number;
  cursor?: string;
}

export class MiroService {
  private config: AppConfig["miro"];
  private experimentalBaseUrl = "https://api.miro.com/v2-experimental";

  constructor(config: AppConfig["miro"]) {
    this.config = config;
  }

  private async fetchWithAuth(url: string): Promise<any> {
    const response = await fetch(url, {
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

  private cleanContent(html: string): string {
    return html
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#43;/g, "+")
      .replace(/&#61;/g, "=")
      .replace(/&#34;/g, '"')
      .trim();
  }

  async fetchAllMindmapNodes(): Promise<MindmapNode[]> {
    const nodes: MindmapNode[] = [];
    let cursor: string | undefined;

    do {
      const url = `${this.experimentalBaseUrl}/boards/${this.config.boardId}/mindmap_nodes?limit=50${cursor ? `&cursor=${cursor}` : ""}`;
      const response: MindmapNodesApiResponse = await this.fetchWithAuth(url);

      for (const node of response.data) {
        const content = node.data?.nodeView?.data?.content || "";
        nodes.push({
          id: node.id,
          content: this.cleanContent(content),
          parentId: node.parent?.id,
          isRoot: node.data?.isRoot || false,
        });
      }

      cursor = response.cursor;
    } while (cursor);

    console.log(`Fetched ${nodes.length} mindmap nodes from Miro`);
    return nodes;
  }

  async getSecondLevelBlocks(): Promise<string[]> {
    try {
      const nodes = await this.fetchAllMindmapNodes();
      const targetId = this.config.targetWidgetId;

      const targetNode = nodes.find(n => n.id === targetId);
      if (!targetNode) {
        console.log(`Target node ${targetId} not found by ID, searching by content...`);
        const byContent = nodes.find(n => 
          n.content.toLowerCase().includes("ключевые векторы")
        );
        if (!byContent) {
          throw new Error("Widget 'Ключевые векторы' не найден на доске");
        }
      }

      const firstLevelChildren = nodes.filter(n => n.parentId === targetId);
      console.log(`Found ${firstLevelChildren.length} first-level children (focus areas)`);

      const firstLevelIds = new Set(firstLevelChildren.map(n => n.id));
      const secondLevelBlocks: string[] = [];

      for (const firstLevelNode of firstLevelChildren) {
        const secondLevelChildren = nodes.filter(n => n.parentId === firstLevelNode.id);
        for (const child of secondLevelChildren) {
          if (child.content) {
            secondLevelBlocks.push(child.content);
          }
        }
      }

      console.log(`Found ${secondLevelBlocks.length} second-level blocks`);
      return secondLevelBlocks;
    } catch (error) {
      console.error("Miro error:", error);
      throw new Error(`Ошибка при получении данных из Miro: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async getFocusAreasWithBlocks(): Promise<Array<{area: string; blocks: string[]}>> {
    try {
      const nodes = await this.fetchAllMindmapNodes();
      const targetId = this.config.targetWidgetId;

      const targetNode = nodes.find(n => n.id === targetId);
      if (!targetNode) {
        throw new Error("Widget 'Ключевые векторы' не найден на доске");
      }

      const firstLevelChildren = nodes.filter(n => n.parentId === targetId);
      const result: Array<{area: string; blocks: string[]}> = [];

      for (const areaNode of firstLevelChildren) {
        const blocks = nodes
          .filter(n => n.parentId === areaNode.id)
          .map(n => n.content)
          .filter(Boolean);
        
        result.push({
          area: areaNode.content,
          blocks,
        });
      }

      return result;
    } catch (error) {
      console.error("Miro error:", error);
      throw error;
    }
  }

  async formatMiroSection(): Promise<string> {
    const focusAreas = await this.getFocusAreasWithBlocks();
    
    if (focusAreas.length === 0) {
      return "Фокус на:\nБлоки не найдены";
    }

    const lines: string[] = ["Фокус на:"];
    
    for (const area of focusAreas) {
      lines.push(`\n• ${area.area}`);
      for (const block of area.blocks) {
        lines.push(`  - ${block}`);
      }
    }

    return lines.join("\n");
  }
}
