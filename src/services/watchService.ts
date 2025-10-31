import chokidar from "chokidar";
import path from "path";
import type { BuildService } from "./buildService.js";
import type { TreeService } from "./treeService.js";

interface RecentChange {
  file: string;
  timestamp: number;
  type: string;
}

export class WatchService {
  private watcher: ReturnType<typeof chokidar.watch> | null = null;
  private pobDirectory: string;
  private recentChanges: RecentChange[] = [];
  private watchEnabled: boolean = false;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private buildService: BuildService;

  constructor(pobDirectory: string, buildService: BuildService) {
    this.pobDirectory = pobDirectory;
    this.buildService = buildService;
  }

  startWatching(): void {
    if (this.watcher) {
      console.error("[File Watcher] Already watching directory");
      return;
    }

    console.error(`[File Watcher] Starting to watch: ${this.pobDirectory}`);

    this.watcher = chokidar.watch(this.pobDirectory, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true, // don't trigger for existing files
      awaitWriteFinish: {
        stabilityThreshold: 500, // wait for file writes to finish
        pollInterval: 100
      }
    });

    this.watcher
      .on("add", (filePath: string) => this.handleFileChange(filePath, "added"))
      .on("change", (filePath: string) => this.handleFileChange(filePath, "modified"))
      .on("unlink", (filePath: string) => this.handleFileChange(filePath, "deleted"))
      .on("error", (error: unknown) => console.error("[File Watcher] Error:", error));

    this.watchEnabled = true;
  }

  async stopWatching(): Promise<void> {
    if (this.watcher) {
      console.error("[File Watcher] Stopping watch");
      await this.watcher.close();
      this.watcher = null;
      this.watchEnabled = false;
    }
  }

  private handleFileChange(filePath: string, changeType: string): void {
    const fileName = path.basename(filePath);

    // Only process .xml files
    if (!fileName.endsWith(".xml")) {
      return;
    }

    // Clear any existing debounce timer for this file
    const existingTimer = this.debounceTimers.get(fileName);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new debounce timer (500ms)
    const timer = setTimeout(() => {
      this.processFileChange(fileName, changeType);
      this.debounceTimers.delete(fileName);
    }, 500);

    this.debounceTimers.set(fileName, timer);
  }

  private processFileChange(fileName: string, changeType: string): void {
    console.error(`[File Watcher] Build ${changeType}: ${fileName}`);

    // Invalidate cache for this build
    this.buildService.invalidateBuild(fileName);

    // Track recent change
    this.recentChanges.push({
      file: fileName,
      timestamp: Date.now(),
      type: changeType
    });

    // Keep only last 50 changes
    if (this.recentChanges.length > 50) {
      this.recentChanges = this.recentChanges.slice(-50);
    }
  }

  isWatchEnabled(): boolean {
    return this.watchEnabled;
  }

  getRecentChanges(limit?: number): RecentChange[] {
    const maxChanges = limit || 10;
    return this.recentChanges.slice(-maxChanges).reverse();
  }

  getDirectory(): string {
    return this.pobDirectory;
  }

  getRecentChangesCount(): number {
    return this.recentChanges.length;
  }
}
