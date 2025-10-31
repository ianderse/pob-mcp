import type { WatchService } from "../services/watchService.js";
import type { BuildService } from "../services/buildService.js";
import type { TreeService } from "../services/treeService.js";

export interface WatchHandlerContext {
  watchService: WatchService;
  buildService: BuildService;
  treeService: TreeService;
}

export function handleStartWatching(context: WatchHandlerContext) {
  if (context.watchService.isWatchEnabled()) {
    return {
      content: [
        {
          type: "text" as const,
          text: "File watching is already enabled.",
        },
      ],
    };
  }

  context.watchService.startWatching();

  return {
    content: [
      {
        type: "text" as const,
        text: `File watching started for: ${context.watchService.getDirectory()}\n\nYour builds will now be automatically reloaded when saved in Path of Building.`,
      },
    ],
  };
}

export async function handleStopWatching(context: WatchHandlerContext) {
  if (!context.watchService.isWatchEnabled()) {
    return {
      content: [
        {
          type: "text" as const,
          text: "File watching is not currently enabled.",
        },
      ],
    };
  }

  await context.watchService.stopWatching();

  return {
    content: [
      {
        type: "text" as const,
        text: "File watching stopped.",
      },
    ],
  };
}

export function handleGetRecentChanges(context: WatchHandlerContext, limit?: number) {
  const changes = context.watchService.getRecentChanges(limit);

  if (changes.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: "No recent changes detected.\n\nMake sure file watching is enabled with 'start_watching'.",
        },
      ],
    };
  }

  let text = `=== Recent Build Changes (Last ${changes.length}) ===\n\n`;

  for (const change of changes) {
    const timeAgo = formatTimeAgo(Date.now() - change.timestamp);
    text += `[${change.type.toUpperCase()}] ${change.file} - ${timeAgo}\n`;
  }

  return {
    content: [
      {
        type: "text" as const,
        text,
      },
    ],
  };
}

export function handleWatchStatus(context: WatchHandlerContext) {
  // Note: We can't easily get cache size from buildService without adding a getter
  // For now, we'll simplify this
  const changeCount = context.watchService.getRecentChangesCount();

  let text = `=== File Watching Status ===\n\n`;
  text += `Status: ${context.watchService.isWatchEnabled() ? "ENABLED" : "DISABLED"}\n`;
  text += `Directory: ${context.watchService.getDirectory()}\n`;
  text += `Recent changes tracked: ${changeCount}\n`;

  if (!context.watchService.isWatchEnabled()) {
    text += `\nUse 'start_watching' to enable automatic build reloading.`;
  }

  return {
    content: [
      {
        type: "text" as const,
        text,
      },
    ],
  };
}

export async function handleRefreshTreeData(context: WatchHandlerContext, version?: string) {
  await context.treeService.refreshTreeData(version);

  return {
    content: [
      {
        type: "text" as const,
        text: version
          ? `Passive tree data cache cleared for version ${version}.\n\nTree data will be re-fetched on next analysis.`
          : `All passive tree data caches cleared.\n\nTree data will be re-fetched on next analysis.`,
      },
    ],
  };
}

function formatTimeAgo(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 60) return `${seconds}s ago`;
  if (minutes < 60) return `${minutes}m ago`;
  return `${hours}h ago`;
}
