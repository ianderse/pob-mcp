import type { BuildService } from "../services/buildService.js";
import type { ValidationService } from "../services/validationService.js";
import type { PoBLuaApiClient, PoBLuaTcpClient } from "../pobLuaBridge.js";

export interface ValidationHandlerContext {
  buildService: BuildService;
  validationService: ValidationService;
  getLuaClient?: () => PoBLuaApiClient | PoBLuaTcpClient | null;
  ensureLuaClient?: () => Promise<void>;
}

/**
 * Handle validate_build tool call
 */
export async function handleValidateBuild(
  context: ValidationHandlerContext,
  args?: { build_name?: string }
) {
  const { buildService, validationService, getLuaClient, ensureLuaClient } = context;

  let buildData;
  let luaStats;
  const buildName = args?.build_name;

  // Try to use Lua bridge for accurate stats if a build is already loaded
  if (getLuaClient && buildName) {
    const luaClient = getLuaClient();

    if (luaClient) {
      try {
        luaStats = await luaClient.getStats();
      } catch (error) {
        // Lua stats failed, will fall back to XML
        console.error('[Validation] Failed to get Lua stats:', error);
      }
    }
  }

  // Load build data from XML
  if (!buildName) {
    throw new Error("build_name is required");
  }

  buildData = await buildService.readBuild(buildName);

  // Parse flasks for immunity validation
  const flaskAnalysis = buildService.parseFlasks(buildData);

  // Run validation
  const validation = validationService.validateBuild(
    buildData,
    flaskAnalysis,
    luaStats
  );

  // Format output
  const formattedOutput = validationService.formatValidation(validation);

  return {
    content: [
      {
        type: "text" as const,
        text: formattedOutput,
      },
    ],
  };
}
