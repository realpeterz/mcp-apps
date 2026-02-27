import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  CallToolResult,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const DIST_DIR = import.meta.filename.endsWith(".ts")
  ? path.join(import.meta.dirname, "dist")
  : import.meta.dirname;

const OUTPUT_DIR = path.join(import.meta.dirname, "output");

export function createServer(): McpServer {
  const server = new McpServer({
    name: "Mask Editor",
    version: "1.0.0",
  });

  const resourceUri = "ui://mask-editor/mcp-app.html";

  // Main tool: opens the mask editor with an optional image
  registerAppTool(
    server,
    "open-mask-editor",
    {
      title: "Open Mask Editor",
      description:
        "Opens an interactive mask editor. Drop an image onto the canvas, paint a selection with the brush tool, then confirm to generate a mask.",
      inputSchema: z.object({
        image: z
          .string()
          .optional()
          .describe(
            "Optional base64 data URL of an image to load into the editor",
          ),
        sessionId: z
          .string()
          .describe(
            "A UUID identifying this conversation. Generate one with crypto.randomUUID() on the first call and reuse the same value for all subsequent calls within this conversation.",
          ),
      }),
      outputSchema: z.object({
        status: z.string(),
        message: z.string(),
      }),
      _meta: { ui: { resourceUri } },
    },
    async ({ image }): Promise<CallToolResult> => {
      const result = {
        status: "ready",
        message: image
          ? "Mask editor opened with image. Paint a selection and click Confirm."
          : "Mask editor opened. Drop an image onto the canvas to begin.",
      };
      return {
        content: [{ type: "text", text: result.message }],
        structuredContent: result,
      };
    },
  );

  // App-only tool: receives mask data from the UI and saves to disk
  registerAppTool(
    server,
    "save-mask",
    {
      title: "Save Mask",
      description: "Receives a mask image from the editor and saves it to disk.",
      inputSchema: z.object({
        maskDataUrl: z.string().describe("The mask image as a base64 data URL"),
        originalFileName: z
          .string()
          .optional()
          .describe("Original file name for reference"),
      }),
      outputSchema: z.object({
        status: z.string(),
        filePath: z.string(),
      }),
      _meta: {
        ui: { resourceUri, visibility: ["app"] },
      },
    },
    async ({ maskDataUrl, originalFileName }): Promise<CallToolResult> => {
      await fs.mkdir(OUTPUT_DIR, { recursive: true });

      // Extract base64 data from data URL
      const matches = maskDataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!matches) {
        return {
          content: [{ type: "text", text: "Invalid mask data URL format" }],
          structuredContent: {
            status: "error",
            filePath: "",
          },
          isError: true,
        };
      }

      const ext = matches[1];
      const base64Data = matches[2];
      const buffer = Buffer.from(base64Data, "base64");

      const baseName = originalFileName
        ? path.parse(originalFileName).name
        : "mask";
      const timestamp = Date.now();
      const fileName = `${baseName}_mask_${timestamp}.${ext}`;
      const filePath = path.join(OUTPUT_DIR, fileName);

      await fs.writeFile(filePath, buffer);
      console.log(`Mask saved to: ${filePath}`);

      const result = {
        status: "saved",
        filePath,
      };

      return {
        content: [{ type: "text", text: `Mask saved to ${filePath}` }],
        structuredContent: result,
      };
    },
  );

  // Serve the bundled HTML UI
  registerAppResource(
    server,
    'mask-editor-app',
    resourceUri,
    { mimeType: RESOURCE_MIME_TYPE },
    async (): Promise<ReadResourceResult> => {
      const html = await fs.readFile(
        path.join(DIST_DIR, "mcp-app.html"),
        "utf-8",
      );
      return {
        contents: [
          { uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html },
        ],
      };
    },
  );

  return server;
}
