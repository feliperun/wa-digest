import fs from "node:fs/promises";
import path from "node:path";
import type { MediaAnalysis, StoredMessage } from "../types.js";
import { nowIso } from "../utils.js";

interface StoreFile {
  messages: StoredMessage[];
  analyses: MediaAnalysis[];
}

export class JsonStore {
  private readonly filePath: string;
  private ready?: Promise<void>;

  constructor(private readonly rootDir: string) {
    this.filePath = path.join(rootDir, "store.json");
  }

  async init(): Promise<void> {
    if (!this.ready) {
      this.ready = (async () => {
        await fs.mkdir(this.rootDir, { recursive: true });
        try {
          await fs.access(this.filePath);
        } catch {
          await this.write({ messages: [], analyses: [] });
        }
      })();
    }
    await this.ready;
  }

  async saveMessage(message: Omit<StoredMessage, "receivedAt">): Promise<StoredMessage> {
    await this.init();
    const data = await this.read();
    const stored: StoredMessage = { ...message, receivedAt: nowIso() };
    const idx = data.messages.findIndex((item) => item.id === stored.id);
    if (idx >= 0) data.messages[idx] = stored;
    else data.messages.push(stored);
    data.messages.sort((a, b) => a.timestamp - b.timestamp);
    await this.write(data);
    return stored;
  }

  async saveAnalysis(analysis: MediaAnalysis): Promise<MediaAnalysis> {
    await this.init();
    const data = await this.read();
    const idx = data.analyses.findIndex((item) => item.messageId === analysis.messageId);
    if (idx >= 0) data.analyses[idx] = analysis;
    else data.analyses.push(analysis);
    await this.write(data);
    return analysis;
  }

  async getAnalysis(messageId: string): Promise<MediaAnalysis | undefined> {
    await this.init();
    const data = await this.read();
    return data.analyses.find((item) => item.messageId === messageId);
  }

  async listChats(): Promise<Array<{ jid: string; messageCount: number; lastTimestamp: number }>> {
    await this.init();
    const data = await this.read();
    const map = new Map<string, { jid: string; messageCount: number; lastTimestamp: number }>();
    for (const message of data.messages) {
      const current = map.get(message.chatJid) || { jid: message.chatJid, messageCount: 0, lastTimestamp: 0 };
      current.messageCount += 1;
      current.lastTimestamp = Math.max(current.lastTimestamp, message.timestamp);
      map.set(message.chatJid, current);
    }
    return Array.from(map.values()).sort((a, b) => b.lastTimestamp - a.lastTimestamp);
  }

  async getMessages(chatJid: string, sinceTimestamp: number): Promise<Array<StoredMessage & { analysis?: MediaAnalysis }>> {
    await this.init();
    const data = await this.read();
    const analyses = new Map(data.analyses.map((item) => [item.messageId, item]));
    return data.messages
      .filter((item) => item.chatJid === chatJid && item.timestamp >= sinceTimestamp)
      .map((item) => ({ ...item, analysis: analyses.get(item.id) }));
  }

  private async read(): Promise<StoreFile> {
    const raw = await fs.readFile(this.filePath, "utf8");
    return JSON.parse(raw) as StoreFile;
  }

  private async write(data: StoreFile): Promise<void> {
    const tmp = `${this.filePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(tmp, this.filePath);
  }
}
